import type { QuestionBody } from "@/lib/db/schema";

export const AUTHORED_QUESTION_TYPES = [
  ["mcq_single", "Multiple choice (one answer)"],
  ["mcq_multi", "Select all that apply"],
  ["truefalse", "True or false"],
  ["fill_blank", "Fill in the blank"],
] as const;
export type AuthoredQuestionType = (typeof AUTHORED_QUESTION_TYPES)[number][0];

export type QuestionInput = {
  type: string;
  prompt: string;
  options: string[];
  /** Option indices for choice questions; "true" or "false" for true/false. */
  correct: string[];
  /** Accepted typed answers, one per line. */
  accepted: string;
  explanation: string;
};

/** Validates an instructor-written question into the stored question shape. */
export function parseQuestionInput(
  input: QuestionInput,
): { value: { type: AuthoredQuestionType; body: QuestionBody } } | { error: string } {
  const type = AUTHORED_QUESTION_TYPES.find(([key]) => key === input.type)?.[0];
  if (!type) return { error: "Choose a question type." };
  const prompt = input.prompt.trim();
  if (!prompt) return { error: "Enter the question." };
  const explanation = input.explanation.trim();
  const body: QuestionBody = { prompt };

  if (type === "mcq_single" || type === "mcq_multi") {
    // Blank option boxes are skipped; chosen answers follow their option.
    const filled = input.options.map((label, i) => ({ label: label.trim(), i })).filter((o) => o.label);
    if (filled.length < 2) return { error: "Add at least two answer options." };
    const chosen = new Set(input.correct.map(Number));
    const correct = filled.flatMap((o, index) => (chosen.has(o.i) ? [index] : []));
    const unmatched = [...chosen].some((i) => !filled.some((o) => o.i === i));
    if (type === "mcq_single" && (correct.length !== 1 || unmatched))
      return { error: "Choose the one correct answer." };
    if (type === "mcq_multi" && (correct.length === 0 || unmatched))
      return { error: "Choose at least one correct answer." };
    body.options = filled.map((o) => o.label);
    body.correct = correct;
  } else if (type === "truefalse") {
    const answer = input.correct[0];
    if (answer !== "true" && answer !== "false") return { error: "Choose True or False." };
    body.correct = [answer === "true" ? 0 : 1];
  } else {
    const accepted = input.accepted.split(/\r?\n/).map((a) => a.trim()).filter(Boolean);
    if (!accepted.length) return { error: "Add at least one accepted answer." };
    body.acceptedAnswers = accepted;
  }
  if (explanation) body.explanation = explanation;
  return { value: { type, body } };
}
