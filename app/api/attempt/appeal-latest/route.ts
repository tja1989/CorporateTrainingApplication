import { and, desc, eq, ne } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";

/** Appeal the latest finalized attempt on a quiz (spec FR-6.10 — once per attempt). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const quizId = new URL(req.url).searchParams.get("quizId");
  if (!quizId) return new Response("Bad request", { status: 400 });

  const [attempt] = await db
    .select()
    .from(t.attempts)
    .where(and(eq(t.attempts.quizId, quizId), eq(t.attempts.userId, user.id), ne(t.attempts.state, "IN_PROGRESS")))
    .orderBy(desc(t.attempts.startedAt))
    .limit(1);
  if (!attempt || attempt.gradingState !== "FINAL") return Response.json({ error: "Nothing to appeal" }, { status: 400 });

  const reviews = await db.select().from(t.gradingReviews).where(eq(t.gradingReviews.attemptId, attempt.id));
  if (reviews.length === 0) return Response.json({ error: "No AI-graded answers on this attempt" }, { status: 400 });
  if (reviews.some((r) => r.reason === "appeal")) return Response.json({ error: "Already appealed" }, { status: 400 });

  for (const r of reviews.filter((x) => x.state !== "PENDING")) {
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
