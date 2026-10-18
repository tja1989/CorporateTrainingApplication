import { scoreQuestion, type Answer, type QuestionForScoring } from "./scoring";

export type ReviewChoice = { label: string; picked: boolean; correct: boolean | null };
export type ReviewItem = {
  questionId: string;
  prompt: string;
  /** null while a written answer awaits grading. */
  correct: boolean | null;
  choices: ReviewChoice[];
  yourAnswer: string[];
  /** The answer key and explanation stay empty until answers may be revealed (spec FR-6.6). */
  correctAnswer: string[];
  explanation: string | null;
  sourceStartSec: number | null;
  rationale: string | null;
};

const NO_ANSWER = "No answer";

/** One question's post-assessment review from its canonical (unshuffled) answer. */
export function reviewItem(
  q: QuestionForScoring & { id: string },
  answer: Answer | undefined,
  opts: { reveal: boolean; rationale?: string | null; sourceStartSec?: number | null },
): ReviewItem {
  const earned = scoreQuestion(q, answer);
  const { body } = q;
  const key = (lines: string[]) => (opts.reveal ? lines : []);
  let choices: ReviewChoice[] = [];
  let yourAnswer: string[] = [];
  let correctAnswer: string[] = [];

  if (q.type === "mcq_single" || q.type === "mcq_multi" || q.type === "truefalse") {
    const labels = q.type === "truefalse" ? ["True", "False"] : (body.options ?? []);
    const picked = new Set(answer?.kind === "choice" ? answer.selected : []);
    const right = new Set(body.correct ?? []);
    choices = labels.map((label, i) => ({ label, picked: picked.has(i), correct: opts.reveal ? right.has(i) : null }));
    if (!picked.size) yourAnswer = [NO_ANSWER];
  } else if (q.type === "matching") {
    const pairs = body.pairs ?? [];
    const chosen = answer?.kind === "matching" ? answer.pairs : {};
    yourAnswer = pairs.map((p, i) => `${p.left} → ${pairs[chosen[i]]?.right ?? NO_ANSWER}`);
    correctAnswer = key(pairs.map((p) => `${p.left} → ${p.right}`));
  } else if (q.type === "ordering") {
    const items = body.orderItems ?? [];
    yourAnswer = answer?.kind === "ordering" ? answer.order.map((i) => items[i] ?? NO_ANSWER) : [NO_ANSWER];
    correctAnswer = key(items);
  } else {
    const text = answer?.kind === "text" ? answer.text.trim() : "";
    yourAnswer = [text || NO_ANSWER];
    if (q.type === "fill_blank") correctAnswer = key((body.acceptedAnswers ?? []).slice(0, 1));
  }

  return {
    questionId: q.id,
    prompt: body.prompt,
    correct: earned === null ? null : earned >= q.points,
    choices,
    yourAnswer,
    correctAnswer,
    explanation: opts.reveal ? (body.explanation ?? null) : null,
    sourceStartSec: opts.sourceStartSec ?? body.sourceStartSec ?? null,
    rationale: opts.rationale ?? null,
  };
}
