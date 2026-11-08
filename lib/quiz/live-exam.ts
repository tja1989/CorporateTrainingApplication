import type { ActionResult } from "@/components/workspace-form";

/** The quiz save refuses with this until the author confirms; the quiz
 * builder recognises it, asks, and saves again with `confirmLiveExam=on`. */
export const LIVE_EXAM_CONFIRMATION_REQUIRED =
  "Confirm that learners will see answers to questions used in a live exam.";

/** Saves the quiz. When the page was loaded before a live exam started using
 * its questions, the save asks for confirmation: `ask` the author, then save
 * again confirmed, or stop with `{ cancelled: true }` and show nothing. */
export async function saveConfirmingLiveExam(
  save: (form: FormData) => Promise<ActionResult | void>,
  form: FormData,
  ask: () => boolean,
): Promise<ActionResult | void> {
  const result = await save(form);
  if (result?.error !== LIVE_EXAM_CONFIRMATION_REQUIRED || form.get("confirmLiveExam") === "on")
    return result;
  if (!ask()) return { cancelled: true };
  form.set("confirmLiveExam", "on");
  return save(form);
}
