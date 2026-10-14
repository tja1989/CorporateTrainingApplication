"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { FeedbackConflict, saveFeedback } from "@/lib/feedback/service";
import type { FeedbackKind, SavedFeedback } from "@/lib/feedback/types";
export type FeedbackActionResult = {
  saved?: SavedFeedback;
  error?: string;
  current?: SavedFeedback | null;
};
export async function saveFeedbackAction(
  completionId: string,
  kind: FeedbackKind,
  form: FormData,
): Promise<FeedbackActionResult> {
  const actor = await requireUser();
  try {
    const saved = await saveFeedback(actor, {
      completionId,
      kind,
      rating: Number(form.get("rating")),
      comment: String(form.get("comment") ?? ""),
      expectedRevision: Number(form.get("revision")),
      requestId: String(form.get("requestId") ?? ""),
    });
    revalidatePath("/profile");
    revalidatePath("/course", "layout");
    return { saved };
  } catch (error) {
    return error instanceof FeedbackConflict
      ? { error: error.message, current: error.current }
      : {
          error:
            error instanceof Error
              ? error.message
              : "Could not save feedback. Your entries are still here.",
        };
  }
}
