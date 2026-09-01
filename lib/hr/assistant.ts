import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { aiAvailable, getClient, logCall, redactPii, MODEL, PROMPT_VERSION } from "@/lib/ai/gateway";
import { searchPolicyChunks, type PolicyChunkHit } from "@/lib/retrieval";
import { screenInput, applyOutputRail, detectLanguage, EVALUATED_LANGUAGES, DETERMINATION_FOOTER } from "./guardrails";
import type { HrCitation } from "@/lib/db/schema";

/**
 * HR assistant answer engine (spec FR-8.4..8.11): guardrails → hard-filtered
 * hybrid retrieval → three-layer confidence → citation-first answer with the
 * determination footer → append-only audit log. Streaming protocol mirrors the
 * Tutor. Mock mode is extractive and honest.
 */

export const HR_ABSTENTION =
  "I couldn't find this in the current policies. I don't want to guess on something that matters — shall I connect you with the HR team?";

const RETRIEVAL_FLOOR = 0.015; // RRF score floor — below it, don't answer (tuned on the golden set)

export function pseudoId(userId: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(userId).digest("hex").slice(0, 16);
}

export type HrEvent =
  | { type: "delta"; text: string }
  | { type: "final"; answer: string; citations: HrCitation[]; mock: boolean; escalationSuggested: boolean; guardrail: string | null }
  | { type: "error"; message: string };

const HR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer_markdown", "citations"],
  properties: {
    answer_markdown: { type: "string" },
    citations: { type: "array", items: { type: "number", description: "index of the cited excerpt" } },
  },
} as const;

const SYSTEM = `You are the HR policy assistant inside LuLu Learn. You answer employees' questions about company policy — nothing else.
Rules:
- Answer ONLY from the provided policy excerpts. Frame answers as "Per [policy name] …".
- Cite the excerpts you used by their index number in the citations array.
- If the excerpts don't answer the question, say you can't find it and suggest escalating to HR.
- NEVER promise outcomes ("you will be approved"), never make determinations, never give legal/medical/visa advice.
- Keep answers short, warm, and ESL-friendly. End factual answers with: "${DETERMINATION_FOOTER}"`;

function toCitation(hit: PolicyChunkHit, docs: Map<string, typeof t.policyDocs.$inferSelect>): HrCitation | null {
  const doc = docs.get(hit.docId);
  if (!doc) return null;
  return {
    docId: doc.id,
    title: doc.title,
    sectionPath: hit.sectionPath,
    version: doc.version,
    effectiveDate: doc.effectiveDate.toISOString().slice(0, 10),
  };
}

export async function* hrAnswer(opts: {
  userId: string;
  question: string;
  country: string;
  audience: "all" | "managers";
}): AsyncGenerator<HrEvent> {
  const question = opts.question.trim();
  const language = detectLanguage(question);
  const { text: safeQuestion, redacted } = redactPii(question);

  const audit = async (fields: Partial<typeof t.hrAuditLog.$inferInsert>) => {
    await db
      .insert(t.hrAuditLog)
      .values({
        id: id(),
        pseudoId: pseudoId(opts.userId),
        language,
        query: safeQuestion,
        piiRedacted: redacted,
        chunkIds: [],
        answer: "",
        modelVersion: aiAvailable() ? MODEL : "mock",
        promptVersion: PROMPT_VERSION,
        ...fields,
      })
      .catch(() => {});
  };

  // ---- layer 0: deterministic guardrails
  const verdict = screenInput(question);
  if (verdict.action !== "allow") {
    await audit({ guardrail: verdict.topic, answer: verdict.response, escalated: verdict.action === "human" });
    yield {
      type: "final",
      answer: verdict.response,
      citations: [],
      mock: !aiAvailable(),
      escalationSuggested: true,
      guardrail: verdict.topic,
    };
    return;
  }

  // ---- retrieval with hard filters (country/audience/effective/superseded)
  let hits: PolicyChunkHit[] = [];
  try {
    hits = await searchPolicyChunks(safeQuestion, { country: opts.country, audience: opts.audience }, 8);
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "Retrieval failed" };
    return;
  }

  // Offline, mock embeddings are lexical noise — demand actual full-text evidence
  const lexicalEvidence = aiAvailable() || hits.some((h) => h.ftsMatched);
  const confident = hits.length > 0 && hits[0].score >= RETRIEVAL_FLOOR && lexicalEvidence;
  if (!confident) {
    await audit({ answer: HR_ABSTENTION, confidence: hits[0]?.score ?? 0, escalated: false });
    yield { type: "final", answer: HR_ABSTENTION, citations: [], mock: !aiAvailable(), escalationSuggested: true, guardrail: null };
    return;
  }

  const docs = new Map(
    (await db.select().from(t.policyDocs).where(inArray(t.policyDocs.id, [...new Set(hits.map((h) => h.docId))]))).map(
      (d) => [d.id, d],
    ),
  );

  // ---- un-evaluated language → hedged template + citations (spec FR-8.9)
  if (!EVALUATED_LANGUAGES.has(language)) {
    const top = hits.slice(0, 2);
    const citations = top.map((h) => toCitation(h, docs)).filter((c): c is HrCitation => !!c);
    const answer =
      `I found the relevant policy, but full answers in your language aren't verified yet — so here is the policy text itself:\n\n` +
      top.map((h) => `**${citations[0]?.title ?? "Policy"} › ${h.sectionPath}**\n${h.text.slice(0, 400)}`).join("\n\n") +
      `\n\nIf anything is unclear, tap “Talk to a person” and HR will answer you directly.\n\n_${DETERMINATION_FOOTER}_`;
    await audit({ answer, citations, chunkIds: top.map((h) => h.id), confidence: hits[0].score, escalated: false });
    yield { type: "final", answer, citations, mock: !aiAvailable(), escalationSuggested: true, guardrail: null };
    return;
  }

  // ---- mock mode: extractive answer with real citations
  if (!aiAvailable()) {
    const top = hits.slice(0, 2);
    const citations = top.map((h) => toCitation(h, docs)).filter((c): c is HrCitation => !!c);
    const answer = applyOutputRail(
      `Per **${citations[0]?.title ?? "policy"}**:\n\n` +
        top.map((h) => `${h.text.slice(0, 350)}${h.text.length > 350 ? "…" : ""}`).join("\n\n") +
        `\n\n*Offline demo answer — the excerpts above are quoted directly from the policy.*`,
    );
    for (const word of answer.split(/(?<=\s)/)) {
      yield { type: "delta", text: word };
      await new Promise((r) => setTimeout(r, 6));
    }
    await audit({ answer, citations, chunkIds: top.map((h) => h.id), confidence: hits[0].score });
    yield { type: "final", answer, citations, mock: true, escalationSuggested: false, guardrail: null };
    return;
  }

  // ---- real model, streaming structured output
  const excerpts = hits.map((h, i) => `[${i}] (${docs.get(h.docId)?.title} › ${h.sectionPath}) ${h.parentText || h.text}`).join("\n\n");
  const started = Date.now();
  const anthropic = getClient();
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 1500,
      system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" as const } }],
      output_config: {
        format: { type: "json_schema" as const, name: "hr_answer", schema: HR_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [{ role: "user" as const, content: `Policy excerpts:\n\n${excerpts}\n\nEmployee question: ${safeQuestion}` }],
    } as Parameters<typeof anthropic.messages.stream>[0]);

    let buffer = "";
    let emitted = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        buffer += event.delta.text;
        const m = buffer.match(/"answer_markdown"\s*:\s*"((?:[^"\\]|\\.)*)/);
        if (m) {
          let answer = "";
          try {
            answer = JSON.parse(`"${m[1]}"`);
          } catch {
            answer = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
          }
          if (answer.length > emitted.length) {
            yield { type: "delta", text: answer.slice(emitted.length) };
            emitted = answer;
          }
        }
      }
    }
    const final = await stream.finalMessage();
    await logCall("hr_assistant", final.usage ?? {}, Date.now() - started);
    if (final.stop_reason === "refusal") {
      yield { type: "final", answer: HR_ABSTENTION, citations: [], mock: false, escalationSuggested: true, guardrail: "refusal" };
      return;
    }
    const textBlock = final.content.find((b) => b.type === "text");
    const parsed = JSON.parse(textBlock && textBlock.type === "text" ? textBlock.text : "{}") as {
      answer_markdown?: string;
      citations?: number[];
    };
    // ---- layer 2: grounding check — no valid citation → abstain (spec FR-8.6)
    const validIdx = (parsed.citations ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < hits.length);
    let answer = parsed.answer_markdown ?? emitted;
    let citations = validIdx.map((i) => toCitation(hits[i], docs)).filter((c): c is HrCitation => !!c);
    const isAbstention = answer.includes("can't find") || answer.includes("couldn't find");
    if (citations.length === 0 && !isAbstention) {
      answer = HR_ABSTENTION;
      citations = [];
    } else {
      answer = applyOutputRail(answer);
    }
    await audit({ answer, citations, chunkIds: validIdx.map((i) => hits[i].id), confidence: hits[0].score });
    yield { type: "final", answer, citations, mock: false, escalationSuggested: citations.length === 0, guardrail: null };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "HR assistant failed" };
  }
}
