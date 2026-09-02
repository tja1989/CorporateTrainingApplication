"use server";

import { revalidatePath } from "next/cache";
import { setFlash } from "@/lib/flash";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { finalizeReview } from "@/lib/quiz/engine";
import { markInterviewReviewed, overturnInterview } from "@/lib/live/store";

export async function confirmGradeAction(reviewId: string): Promise<void> {
  const admin = await requireRole("ADMIN");
  await finalizeReview(reviewId, admin.id, null);
  await setFlash("Grade confirmed — the learner has been notified.");
  revalidatePath("/admin/reviews");
}

export async function adjustGradeAction(reviewId: string, form: FormData): Promise<void> {
  const admin = await requireRole("ADMIN");
  const [review] = await db.select().from(t.gradingReviews).where(eq(t.gradingReviews.id, reviewId)).limit(1);
  if (!review) return;
  const target = Number(form.get("points") ?? 0);
  const aiScores = review.aiScores ?? [];
  const max = aiScores.reduce((s, c) => s + c.max, 0) || 1;
  const clamped = Math.max(0, Math.min(max, target));
  // distribute the adjusted total proportionally across criteria
  const finalScores = aiScores.map((c) => ({ ...c, points: Math.round((c.max / max) * clamped * 2) / 2 }));
  await finalizeReview(reviewId, admin.id, finalScores);
  await setFlash("Grade adjusted and finalized.");
  revalidatePath("/admin/reviews");
}

export async function approveDraftAction(questionId: string): Promise<void> {
  await requireRole("ADMIN");
  await db.update(t.questions).set({ status: "APPROVED" }).where(eq(t.questions.id, questionId));
  await setFlash("AI draft approved and added to the bank.");
  revalidatePath("/admin/reviews");
}

export async function discardDraftAction(questionId: string): Promise<void> {
  await requireRole("ADMIN");
  await db.update(t.questions).set({ status: "RETIRED" }).where(eq(t.questions.id, questionId));
  await setFlash("AI draft discarded.", "neutral");
  revalidatePath("/admin/reviews");
}

export async function markInterviewReviewedAction(interviewId: string): Promise<void> {
  const admin = await requireRole("ADMIN");
  await markInterviewReviewed(interviewId, admin.id);
  await setFlash("Oral check marked as reviewed.");
  revalidatePath("/admin/reviews");
}

export async function overturnInterviewAction(interviewId: string): Promise<void> {
  const admin = await requireRole("ADMIN");
  await overturnInterview(interviewId, admin.id);
  await setFlash("Oral check overturned to a pass — the learner has been notified.");
  revalidatePath("/admin/reviews");
}
