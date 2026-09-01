import { and, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { aiAvailable, structuredCall } from "@/lib/ai/gateway";

/**
 * AI quiz generation from ingested video transcripts (spec FR-5.4/FR-6.9):
 * generated questions ALWAYS land as DRAFT for admin review — never published.
 * Mock mode builds cloze/MCQ drafts from transcript sentences so the review
 * queue is demoable offline.
 */

type DraftQ = {
  type: "mcq_single" | "fill_blank";
  prompt: string;
  options?: string[];
  correct?: number[];
  acceptedAnswers?: string[];
  explanation: string;
  sourceStartSec: number;
};

export async function generateDraftQuestions(videoId: string): Promise<number> {
  const [video] = await db.select().from(t.videos).where(eq(t.videos.id, videoId)).limit(1);
  if (!video) return 0;
  const chunks = await db.select().from(t.videoChunks).where(eq(t.videoChunks.videoId, videoId));
  if (chunks.length === 0) return 0;

  // one draft bank per video, reused on re-ingest
  const bankName = `AI drafts: ${video.title}`;
  let [bank] = await db.select().from(t.questionBanks).where(eq(t.questionBanks.name, bankName)).limit(1);
  if (!bank) {
    const bankId = id();
    await db.insert(t.questionBanks).values({ id: bankId, name: bankName, tags: ["ai-draft"] });
    [bank] = await db.select().from(t.questionBanks).where(eq(t.questionBanks.id, bankId)).limit(1);
  } else {
    await db
      .delete(t.questions)
      .where(and(eq(t.questions.bankId, bank.id), eq(t.questions.status, "DRAFT")));
  }

  let drafts: DraftQ[] = [];
  if (aiAvailable()) {
    const transcript = chunks.map((c) => `[${c.startSec}s] ${c.text}`).join("\n\n");
    const result = await structuredCall<{ questions: DraftQ[] }>({
      route: "quiz_generate",
      system:
        "Generate 4-6 quiz questions from this training-video transcript for retail employees. Target specific facts and procedures actually stated. Each MCQ has 4 options with plausible distractors; include an explanation and the transcript timestamp (sourceStartSec) the answer comes from. ESL-friendly wording.",
      user: transcript.slice(0, 24000),
      schemaName: "draft_questions",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["questions"],
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "prompt", "explanation", "sourceStartSec"],
              properties: {
                type: { type: "string", enum: ["mcq_single", "fill_blank"] },
                prompt: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                correct: { type: "array", items: { type: "number" } },
                acceptedAnswers: { type: "array", items: { type: "string" } },
                explanation: { type: "string" },
                sourceStartSec: { type: "number" },
              },
            },
          },
        },
      },
      effort: "medium",
    });
    drafts = result.questions;
  } else {
    drafts = mockDrafts(chunks);
  }

  for (const d of drafts) {
    await db.insert(t.questions).values({
      id: id(),
      bankId: bank.id,
      type: d.type,
      status: "DRAFT",
      points: 1,
      body: {
        prompt: d.prompt,
        options: d.options,
        correct: d.correct,
        acceptedAnswers: d.acceptedAnswers,
        explanation: d.explanation,
        sourceStartSec: d.sourceStartSec,
      },
      source: { videoId, startSec: d.sourceStartSec },
      createdBy: "ai",
    });
  }
  return drafts.length;
}

function mockDrafts(chunks: Array<{ startSec: number; text: string }>): DraftQ[] {
  const out: DraftQ[] = [];
  for (const chunk of chunks.slice(0, 3)) {
    const sentences = chunk.text.split(/(?<=[.!?])\s+/).filter((s) => s.split(" ").length >= 8);
    const sentence = sentences[Math.floor(sentences.length / 2)] ?? sentences[0];
    if (!sentence) continue;
    const words = sentence.split(" ");
    const keyIdx = words.findIndex((w) => /^\d+$/.test(w.replace(/\D/g, "")) && w.replace(/\D/g, "").length > 0);
    const target = keyIdx >= 0 ? words[keyIdx] : words.reduce((a, b) => (b.length > a.length ? b : a));
    const clean = target.replace(/[^\p{L}\p{N}]/gu, "");
    out.push({
      type: "fill_blank",
      prompt: sentence.replace(target, "_____"),
      acceptedAnswers: [clean],
      explanation: `From the video: “${sentence}”`,
      sourceStartSec: chunk.startSec,
    });
  }
  return out;
}
