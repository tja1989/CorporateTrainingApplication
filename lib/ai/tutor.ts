import { aiAvailable, getClient, logCall, redactPii, MODEL } from "./gateway";
import { searchVideoChunks, type VideoChunkHit } from "@/lib/retrieval";
import type { TutorCitation } from "@/lib/db/schema";

/**
 * Tutor answering engine (spec FR-5.9..5.13). Pinned wire protocol: streaming
 * structured output {answer_markdown, citations[]}; the caller receives text
 * deltas plus validated citations at completion. Mock mode produces an honest
 * extractive answer from retrieval, clearly labeled by the caller.
 */

export const ABSTENTION = "I can't find this in the lesson. Try widening to the whole course, or rephrase your question.";

const CITATION_TOLERANCE_SEC = 10;

/** Server-side citation validation (spec FR-5.11): every citation must fall inside a retrieved chunk (±10s). */
export function validateCitations(citations: TutorCitation[], chunks: Array<Pick<VideoChunkHit, "startSec" | "endSec"> & { videoId?: string }>): TutorCitation[] {
  return citations.flatMap(c => {
    if (!Number.isFinite(c.startSec) || c.startSec < 0 || !Number.isFinite(c.endSec) || c.endSec < c.startSec) return [];
    const matches = chunks.filter(chunk => (!c.videoId || chunk.videoId === c.videoId) && c.startSec >= chunk.startSec - CITATION_TOLERANCE_SEC && c.startSec <= chunk.endSec + CITATION_TOLERANCE_SEC);
    const sources = new Set(matches.map(chunk => chunk.videoId));
    // A timestamp alone cannot identify one of several videos. Never guess a destination.
    return matches.length && sources.size === 1 ? [{ ...c, ...(matches[0].videoId ? { videoId: matches[0].videoId } : {}) }] : [];
  });
}

const TUTOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer_markdown", "citations"],
  properties: {
    answer_markdown: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["videoId", "startSec", "endSec", "quote"],
        properties: {
          startSec: { type: "number" },
          videoId: { type: "string", description: "Exact video ID from the cited excerpt header" },
          endSec: { type: "number" },
          quote: { type: "string", description: "Short verbatim quote from the transcript excerpt cited" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are the lesson Tutor inside welearn, a corporate training platform for retail employees.
Answer ONLY from the provided transcript excerpts of the current training video. Ground every factual claim in an excerpt and cite it (startSec/endSec from the excerpt header, plus a short verbatim quote).
If the excerpts do not answer the question, set answer_markdown to exactly: "${ABSTENTION}" with an empty citations array.
Match the learner's language (including Romanized Hindi/Malayalam). Many learners use English as a second language: keep answers short, concrete, and friendly. Use simple markdown.`;

export type TutorEvent =
  | { type: "delta"; text: string }
  | { type: "final"; answer: string; citations: TutorCitation[]; mock: boolean }
  | { type: "error"; message: string };

function extractAnswerFromPartialJson(buffer: string): string {
  const m = buffer.match(/"answer_markdown"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!m) return "";
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

export async function* tutorAnswer(opts: {
  question: string;
  scope: { videoId?: string; videoIds?: string[] };
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): AsyncGenerator<TutorEvent> {
  let chunks: VideoChunkHit[] = [];
  try {
    chunks = await searchVideoChunks(opts.question, opts.scope, 10);
  } catch (err) {
    yield { type: "error", message: `Retrieval failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }

  if (chunks.length === 0) {
    yield { type: "final", answer: ABSTENTION, citations: [], mock: !aiAvailable() };
    return;
  }

  if (!aiAvailable()) {
    // Honest extractive mock: quote the best-matching excerpts with real timestamps.
    const top = chunks.slice(0, 2);
    const answer =
      `**From this lesson:**\n\n` +
      top.map((c) => `${excerptSentence(c.text, opts.question)}`).join("\n\n") +
      `\n\n*Offline demo answer — connect an AI key for full tutoring.*`;
    const citations = top.map((c) => ({
      videoId: c.videoId,
      startSec: c.startSec,
      endSec: c.endSec,
      quote: c.text.slice(0, 120),
    }));
    for (const word of answer.split(/(?<=\s)/)) {
      yield { type: "delta", text: word };
      await new Promise((r) => setTimeout(r, 8));
    }
    yield { type: "final", answer, citations, mock: true };
    return;
  }

  const excerpts = chunks.map((c) => `[videoId=${c.videoId} ${c.startSec}s-${c.endSec}s] ${c.text}`).join("\n\n");
  const { text: safeQuestion } = redactPii(opts.question);
  const started = Date.now();
  const anthropic = getClient();
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" as const } }],
      output_config: {
        format: { type: "json_schema" as const, schema: TUTOR_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        ...opts.history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: `Transcript excerpts:\n\n${excerpts}\n\nLearner question: ${safeQuestion}` },
      ],
    } as Parameters<typeof anthropic.messages.stream>[0]);

    let buffer = "";
    let emitted = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        buffer += event.delta.text;
        const answer = extractAnswerFromPartialJson(buffer);
        if (answer.length > emitted.length) {
          yield { type: "delta", text: answer.slice(emitted.length) };
          emitted = answer;
        }
      }
    }
    const final = await stream.finalMessage();
    await logCall("tutor", final.usage ?? {}, Date.now() - started);
    if (final.stop_reason === "refusal") {
      yield { type: "final", answer: "I can't help with that here.", citations: [], mock: false };
      return;
    }
    const textBlock = final.content.find((b) => b.type === "text");
    const parsed = JSON.parse(textBlock && textBlock.type === "text" ? textBlock.text : "{}") as {
      answer_markdown?: string;
      citations?: TutorCitation[];
    };
    let answer = parsed.answer_markdown ?? emitted;
    let citations = validateCitations(parsed.citations ?? [], chunks);
    // All-invalid citations on a factual answer → abstain (mirrors FR-8.6 layer 2).
    if ((parsed.citations?.length ?? 0) > 0 && citations.length === 0) {
      answer = ABSTENTION;
      citations = [];
    }
    yield { type: "final", answer, citations, mock: false };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

function excerptSentence(text: string, question: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const qWords = new Set(question.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  let best = sentences[0] ?? text;
  let bestScore = -1;
  for (const s of sentences) {
    const score = s
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => qWords.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  const idx = sentences.indexOf(best);
  const ctx = sentences.slice(Math.max(0, idx), idx + 2).join(" ");
  return `“${ctx.trim()}”`;
}

/** Suggested questions near the playhead (spec FR-5.9). Template-based in mock mode. */
export async function suggestQuestions(chunkTexts: string[]): Promise<string[]> {
  const fallback = [
    "Can you summarize this part in two sentences?",
    "Why does this matter on the shop floor?",
    "Give me an example of how to apply this.",
  ];
  if (!aiAvailable() || chunkTexts.length === 0) return fallback;
  try {
    const { structuredCall } = await import("./gateway");
    const result = await structuredCall<{ questions: string[] }>({
      route: "tutor_suggest",
      system: "Generate exactly 3 short questions a retail employee might ask about this training-video excerpt. Plain, practical, ESL-friendly.",
      user: chunkTexts.join("\n\n").slice(0, 4000),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["questions"],
        properties: { questions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 } },
      },
      effort: "low",
      maxTokens: 300,
    });
    return result.questions;
  } catch {
    return fallback;
  }
}
