import type { QuestionBody } from "@/lib/db/schema";

/**
 * Per-type scoring semantics — pinned by spec FR-6.7:
 * default 1 point/question with optional per-question points;
 * mcq_single / truefalse / fill_blank: all-or-nothing;
 * mcq_multi: all-or-nothing (partial credit is fast-follow);
 * matching / ordering: proportional; free_text: rubric points normalized.
 */

export type Answer =
  | { kind: "choice"; selected: number[] } // mcq_single (len 1), mcq_multi, truefalse ([0]=true,[1]=false)
  | { kind: "text"; text: string } // fill_blank, free_text
  | { kind: "matching"; pairs: Record<number, number> } // leftIndex -> rightIndex (as displayed order of rights)
  | { kind: "ordering"; order: number[] }; // item indices in learner order

export type QuestionForScoring = {
  type: "mcq_single" | "mcq_multi" | "truefalse" | "fill_blank" | "matching" | "ordering" | "free_text";
  points: number;
  body: QuestionBody;
};

export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns earned points for one question (free_text returns null — graded separately). */
export function scoreQuestion(q: QuestionForScoring, answer: Answer | undefined): number | null {
  if (q.type === "free_text") return null;
  if (!answer) return 0;
  const pts = q.points;

  switch (q.type) {
    case "mcq_single":
    case "truefalse": {
      if (answer.kind !== "choice" || answer.selected.length !== 1) return 0;
      const correct = q.body.correct ?? [];
      return correct.length === 1 && answer.selected[0] === correct[0] ? pts : 0;
    }
    case "mcq_multi": {
      if (answer.kind !== "choice") return 0;
      const correct = new Set(q.body.correct ?? []);
      const selected = new Set(answer.selected);
      if (correct.size !== selected.size) return 0;
      for (const c of correct) if (!selected.has(c)) return 0;
      return pts;
    }
    case "fill_blank": {
      if (answer.kind !== "text") return 0;
      const accepted = (q.body.acceptedAnswers ?? []).map(normalizeText);
      return accepted.includes(normalizeText(answer.text)) ? pts : 0;
    }
    case "matching": {
      if (answer.kind !== "matching") return 0;
      const pairs = q.body.pairs ?? [];
      if (pairs.length === 0) return 0;
      let correct = 0;
      for (let i = 0; i < pairs.length; i++) {
        if (answer.pairs[i] === i) correct++;
      }
      return (correct / pairs.length) * pts;
    }
    case "ordering": {
      if (answer.kind !== "ordering") return 0;
      const items = q.body.orderItems ?? [];
      if (items.length === 0) return 0;
      let correct = 0;
      for (let i = 0; i < items.length; i++) {
        if (answer.order[i] === i) correct++;
      }
      return (correct / items.length) * pts;
    }
  }
}

export type QuizScore = {
  earned: number;
  possible: number;
  pct: number;
  pendingFreeText: string[]; // question ids needing grading
};

export function scoreQuiz(
  items: Array<{ questionId: string; q: QuestionForScoring; answer: Answer | undefined; freeTextEarned?: number | null }>,
): QuizScore {
  let earned = 0;
  let possible = 0;
  const pendingFreeText: string[] = [];
  for (const item of items) {
    possible += item.q.points;
    if (item.q.type === "free_text") {
      if (item.freeTextEarned !== null && item.freeTextEarned !== undefined) earned += item.freeTextEarned;
      else pendingFreeText.push(item.questionId);
      continue;
    }
    earned += scoreQuestion(item.q, item.answer) ?? 0;
  }
  return {
    earned: Math.round(earned * 100) / 100,
    possible,
    pct: possible === 0 ? 0 : Math.round((earned / possible) * 1000) / 10,
    pendingFreeText,
  };
}

/** Deterministic-at-call shuffle honoring locked option indices (spec FR-6.4). */
export function shuffleChoices(optionCount: number, locked: number[] = [], rand: () => number = Math.random): number[] {
  const lockedSet = new Set(locked);
  const movable = Array.from({ length: optionCount }, (_, i) => i).filter((i) => !lockedSet.has(i));
  for (let i = movable.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [movable[i], movable[j]] = [movable[j], movable[i]];
  }
  const out: number[] = [];
  let m = 0;
  for (let i = 0; i < optionCount; i++) {
    out.push(lockedSet.has(i) ? i : movable[m++]);
  }
  return out;
}
