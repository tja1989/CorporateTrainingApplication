import { and, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";

/** Learner appeal: any finalized AI-graded result → human re-review, once (spec FR-6.10). */
export async function POST(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { attemptId } = await params;
  const [attempt] = await db.select().from(t.attempts).where(eq(t.attempts.id, attemptId)).limit(1);
  if (!attempt || attempt.userId !== user.id) return new Response("Not found", { status: 404 });
  if (attempt.gradingState !== "FINAL") return Response.json({ error: "Already under review" }, { status: 400 });

  const existing = await db
    .select()
    .from(t.gradingReviews)
    .where(and(eq(t.gradingReviews.attemptId, attempt.id), eq(t.gradingReviews.reason, "appeal")));
  if (existing.length > 0) return Response.json({ error: "This attempt has already been appealed" }, { status: 400 });

  const aiReviews = await db.select().from(t.gradingReviews).where(eq(t.gradingReviews.attemptId, attempt.id));
  if (aiReviews.length === 0) return Response.json({ error: "Nothing to appeal on this attempt" }, { status: 400 });

  for (const r of aiReviews) {
    await db.insert(t.gradingReviews).values({
      id: id(),
      attemptId: attempt.id,
      questionId: r.questionId,
      aiScores: r.aiScores,
      aiRationale: r.aiRationale,
      aiConfidence: r.aiConfidence,
      reason: "appeal",
      state: "PENDING",
      modelVersion: r.modelVersion,
      promptVersion: r.promptVersion,
    });
  }
  await db.update(t.attempts).set({ gradingState: "PROVISIONAL", state: "SUBMITTED" }).where(eq(t.attempts.id, attempt.id));
  return Response.json({ ok: true });
}
