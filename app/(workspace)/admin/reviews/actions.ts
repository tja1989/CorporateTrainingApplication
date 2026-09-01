"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { finalizeReview } from "@/lib/quiz/engine";

export async function confirmGradeAction(reviewId: string): Promise<void> {
  const admin = await requireRole("ADMIN");
  await finalizeReview(reviewId, admin.id, null);
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
  revalidatePath("/admin/reviews");
}

export async function approveDraftAction(questionId: string): Promise<void> {
  await requireRole("ADMIN");
  await db.update(t.questions).set({ status: "APPROVED" }).where(eq(t.questions.id, questionId));
  revalidatePath("/admin/reviews");
}

export async function discardDraftAction(questionId: string): Promise<void> {
  await requireRole("ADMIN");
  await db.update(t.questions).set({ status: "RETIRED" }).where(eq(t.questions.id, questionId));
  revalidatePath("/admin/reviews");
}
