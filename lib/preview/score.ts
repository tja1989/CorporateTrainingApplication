import type { QuestionBody, Rubric, ServedItem } from "@/lib/db/schema";
import { unmapAnswer } from "@/lib/quiz/engine";
import { scoreQuestion, type Answer, type QuestionForScoring } from "@/lib/quiz/scoring";
import type { ReviewItem } from "@/lib/quiz/review";

export type PreviewResultItem = {
  questionId: string;
  type: string;
  prompt: string;
  points: number;
  earned: number | null;
  body: QuestionBody;
  rubric: Rubric | null;
  /** What a learner sees after submitting, with the answer key shown; null for written answers. */
  review: ReviewItem | null;
};

export type PreviewResult = {
  earned: number;
  possible: number;
  pct: number;
  passed: boolean;
  passPct: number;
  writtenCount: number;
  items: PreviewResultItem[];
};

/** Pure scoring for a preview attempt. Free text is not auto-scored: it is left out of `possible`. */
export function previewScore(
  items: { q: QuestionForScoring & { id: string }; served: ServedItem; answer: Answer | undefined }[],
  passPct: number,
): Omit<PreviewResult, "items" | "passPct"> & { earnedById: Map<string, number | null> } {
  let earned = 0;
  let possible = 0;
  let writtenCount = 0;
  const earnedById = new Map<string, number | null>();
  for (const item of items) {
    if (item.q.type === "free_text") {
      writtenCount++;
      earnedById.set(item.q.id, null);
      continue;
    }
    // unmapAnswer only reads `served`, never the question, so the scoring shape is enough.
    const got = scoreQuestion(item.q, unmapAnswer(item.q as never, item.served, item.answer)) ?? 0;
    possible += item.q.points;
    earned += got;
    earnedById.set(item.q.id, got);
  }
  const pct = possible === 0 ? 0 : Math.round((earned / possible) * 1000) / 10;
  return {
    earned: Math.round(earned * 100) / 100,
    possible,
    pct,
    passed: possible > 0 && pct >= passPct,
    writtenCount,
    earnedById,
  };
}
