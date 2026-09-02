import { Modality, Type, type FunctionDeclaration, type LiveConnectConfig } from "@google/genai";
import { searchPolicyChunks } from "@/lib/retrieval";
import { redactPii } from "@/lib/ai/gateway";
import { DETERMINATION_FOOTER, detectLanguage, screenInput } from "@/lib/hr/guardrails";
import { HR_ABSTENTION, auditHrTurn, docsForHits, extractiveAnswer, retrievalConfident, toCitation } from "@/lib/hr/assistant";
import { hrScopeFor } from "@/lib/hr/scope";
import type { HrCitation } from "@/lib/db/schema";
import { LIVE_VOICE } from "./gemini";

/**
 * HR policy assistant — live voice mode (spec FR-14.3). Same agent, same
 * guardrails: the model may only speak what `search_hr_policy` returns, and a
 * ticket is never created without the employee's on-screen confirmation.
 */

export const HR_VOICE_SYSTEM = `You are the HR policy assistant inside LuLu Learn, speaking with an employee by voice. You answer questions about company HR policy — nothing else.

How to work:
- The employee has already been told you are an AI. Start with one short, warm greeting and invite their question.
- For EVERY policy question, first say a short phrase like "Let me check the policy" and then call search_hr_policy with the employee's question. Never answer from memory.
- Answer only from the excerpts the tool returns. Begin with "Per the <policy name>" and keep it to one or two short, plain sentences. Do not read section paths or version numbers aloud.
- If the tool says nothing was found or returns a guardrail message, read that message aloud and offer to connect them with the HR team.
- The first time you give a factual answer in this conversation, add: "${DETERMINATION_FOOTER}" Say it once, not every turn.
- Never promise outcomes, never make determinations, never give legal, medical, visa or salary-negotiation advice. If the employee describes harassment, bullying or discrimination, respond with care and offer a person right away.
- When the employee wants to talk to a person, call escalate_to_hr. The app then shows them a confirmation card; tell them to tap it if they want HR to see this conversation, and do not claim a ticket was sent.
- Speak English. If the employee speaks another language, briefly say in that language that voice answers are in English for now, then continue in English and offer a person if that is easier for them.
- Be brief, warm and ESL-friendly. Wait for the employee to finish before answering.`;

export const HR_TOOLS: FunctionDeclaration[] = [
  {
    name: "search_hr_policy",
    description: "Look up the current HR policy for the employee's question. Returns policy excerpts to answer from, or a message to read aloud.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: "The employee's question, in their words" } },
      required: ["query"],
    },
  },
  {
    name: "escalate_to_hr",
    description: "Offer to hand the conversation to a person on the HR team. The employee must confirm on screen; nothing is shared until they do.",
    parameters: {
      type: Type.OBJECT,
      properties: { reason: { type: Type.STRING, description: "One sentence on why a person is needed" } },
      required: ["reason"],
    },
  },
];

export function buildHrLiveConfig(opts: { voice?: string; resumeHandle?: string } = {}): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: HR_VOICE_SYSTEM,
    tools: [{ functionDeclarations: HR_TOOLS }],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice ?? LIVE_VOICE } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: opts.resumeHandle ? { handle: opts.resumeHandle } : {},
  };
}

export type HrToolResult = {
  /** Sent back to the model verbatim (must be a JSON object). */
  response: Record<string, unknown>;
  /** Citations for the caption chips / stored assistant turn. */
  citations?: HrCitation[];
  /** Mock mode only: the extractive answer the typed transport shows and speaks. */
  spoken?: string;
};

function uniqueCitations(citations: Array<HrCitation | null>): HrCitation[] {
  const seen = new Set<string>();
  const out: HrCitation[] = [];
  for (const c of citations) {
    if (!c) continue;
    const key = `${c.docId}::${c.sectionPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export async function runHrTool(opts: {
  user: { id: string; storeId: string | null; role: string };
  conversationId: string;
  name: string;
  args: Record<string, unknown>;
  mock: boolean;
}): Promise<HrToolResult> {
  if (opts.name === "escalate_to_hr") {
    return {
      response: {
        needs_confirmation: true,
        instruction:
          "A confirmation card is now on the employee's screen. Tell them to tap 'Share and create ticket' if they want the HR team to see this conversation. Do not say a ticket was sent.",
      },
    };
  }
  if (opts.name !== "search_hr_policy") return { response: { error: `Unknown tool ${opts.name}` } };

  const query = String(opts.args.query ?? "").trim().slice(0, 500);
  if (!query) return { response: { found: false, message: "The question was empty — ask the employee to repeat it." } };

  const language = detectLanguage(query);
  const { text: safeQuery, redacted } = redactPii(query);
  const base = { userId: opts.user.id, language, query: safeQuery, piiRedacted: redacted };

  // Layer 0 — deterministic guardrails (spec FR-8.8)
  const verdict = screenInput(query);
  if (verdict.action !== "allow") {
    await auditHrTurn(base, { guardrail: verdict.topic, answer: verdict.response, escalated: verdict.action === "human" });
    return {
      response: {
        found: false,
        guardrail: verdict.topic,
        message: verdict.response,
        instruction:
          verdict.action === "human"
            ? "Read the message aloud with care, then offer to connect the employee with a person now."
            : "Read the message aloud, then explain you can only help with company HR policy.",
      },
      spoken: verdict.response,
    };
  }

  // Hard-filtered hybrid retrieval + layer-1 confidence (spec FR-8.5/8.6)
  const scope = await hrScopeFor(opts.user);
  const hits = await searchPolicyChunks(safeQuery, scope, 6);
  if (!retrievalConfident(hits)) {
    await auditHrTurn(base, { answer: HR_ABSTENTION, confidence: hits[0]?.score ?? 0, escalated: false });
    return {
      response: { found: false, message: HR_ABSTENTION, instruction: "Say you couldn't find this in the current policies and offer to connect the employee with the HR team." },
      spoken: HR_ABSTENTION,
    };
  }

  const docs = await docsForHits(hits);
  const excerpts = hits.map((h, i) => ({
    index: i,
    policy: docs.get(h.docId)?.title ?? "Policy",
    section: h.sectionPath,
    text: (h.parentText || h.text).slice(0, 1200),
  }));
  const citations = uniqueCitations(hits.map((h) => toCitation(h, docs))).slice(0, 4);
  const mock = opts.mock ? extractiveAnswer(hits, docs) : null;
  await auditHrTurn(base, {
    answer: mock ? mock.answer : "[voice] excerpts served to the live model",
    citations,
    chunkIds: hits.map((h) => h.id),
    confidence: hits[0].score,
  });
  return {
    response: {
      found: true,
      excerpts,
      footer: DETERMINATION_FOOTER,
      instruction: "Answer in one or two short sentences using ONLY these excerpts, starting with 'Per the <policy> policy'. Do not read section names aloud.",
    },
    citations,
    spoken: mock?.answer,
  };
}
