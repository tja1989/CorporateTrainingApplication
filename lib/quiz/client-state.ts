import type { Answer } from "./scoring";
export function isAnswered(q: { type: string; left?: string[] | null; orderItems?: string[] | null }, answer: Answer | undefined) {
  if (!answer) return false;
  if (answer.kind === "text") return answer.text.trim().length > 0;
  if (answer.kind === "choice") return answer.selected.length > 0;
  if (answer.kind === "matching") return (q.left?.length ?? 0) > 0 && q.left!.every((_, i) => Number.isInteger(answer.pairs[i]));
  return answer.order.length === q.orderItems?.length && new Set(answer.order).size === answer.order.length;
}
export function resultStatus(result: { gradingState: string; state: string; passed: boolean | null }) {
  return result.gradingState !== "FINAL" || result.state !== "GRADED" || result.passed === null ? "pending" : result.passed ? "pass" : "fail";
}
export class AttemptSaveError extends Error {
  constructor(message: string, public submitted: boolean) {
    super(message);
  }
}
export async function saveAttemptAnswers(attemptId: string, answers: Record<string, Answer>, events: Array<{ kind: string; detail?: Record<string, unknown> }>, fetcher: typeof fetch = fetch) {
  const res = await fetcher(`/api/attempt/${attemptId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers, events }) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new AttemptSaveError(data.error ?? "Answers could not be saved. Keep this page open and retry.", res.status === 409 && data.submitted === true);
  }
}
export async function submitSavedAttempt(attemptId: string, answers: Record<string, Answer>, events: Array<{ kind: string; detail?: Record<string, unknown> }>, fetcher: typeof fetch = fetch) {
  try {
    await saveAttemptAnswers(attemptId, answers, events, fetcher);
  } catch (error) {
    if (!(error instanceof AttemptSaveError && error.submitted)) throw error;
  }
  const res = await fetcher(`/api/attempt/${attemptId}`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Submission failed. Your saved answers are safe; try again.");
  return data;
}
