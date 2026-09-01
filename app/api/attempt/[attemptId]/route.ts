import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { saveAnswers, submitAttempt, canRevealAnswers, unmapAnswer } from "@/lib/quiz/engine";
import { scoreQuestion, type Answer } from "@/lib/quiz/scoring";

/**
 * PATCH = autosave answers (+ integrity events); POST = submit.
 * Results respect the per-quiz feedback policy (spec FR-6.6).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { attemptId } = await params;
  const [attempt] = await db.select().from(t.attempts).where(eq(t.attempts.id, attemptId)).limit(1);
  if (!attempt || attempt.userId !== user.id) return new Response("Not found", { status: 404 });
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, attempt.quizId)).limit(1);
  if (!quiz) return new Response("Not found", { status: 404 });
  const body = (await req.json()) as { answers?: Record<string, Answer>; events?: Array<{ kind: string; detail?: Record<string, unknown> }> };

  if (body.events && attempt.integrityMode) {
    const severity = (kind: string): "red" | "orange" | "info" =>
      kind === "focus_lost_long" ? "red" : kind === "blur" || kind === "fullscreen_exit" || kind === "paste_blocked" ? "orange" : "info";
    for (const event of body.events.slice(0, 20)) {
      await db.insert(t.integrityEvents).values({
        id: id(),
        attemptId: attempt.id,
        kind: event.kind,
        detail: event.detail ?? {},
        severity: severity(event.kind),
      });
    }
  }

  if (body.answers && Object.keys(body.answers).length > 0) {
    try {
      await saveAnswers(attempt, quiz, body.answers);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Save failed", submitted: true }, { status: 409 });
    }
  }
  return Response.json({ ok: true, savedAt: new Date().toISOString() });
}

export async function POST(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { attemptId } = await params;
  const [attempt] = await db.select().from(t.attempts).where(eq(t.attempts.id, attemptId)).limit(1);
  if (!attempt || attempt.userId !== user.id) return new Response("Not found", { status: 404 });

  const updated = await submitAttempt(attempt.id);
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, updated.quizId)).limit(1);
  if (!quiz) return new Response("Not found", { status: 404 });
  const reveal = canRevealAnswers(quiz.settings);

  let review: Array<{
    questionId: string;
    prompt: string;
    correct: boolean | null;
    explanation: string | null;
    sourceStartSec: number | null;
    rationale: string | null;
  }> = [];
  if (reveal) {
    const questions = await db
      .select()
      .from(t.questions)
      .where(inArray(t.questions.id, updated.servedItems.map((s) => s.questionId)));
    const byId = new Map(questions.map((q) => [q.id, q]));
    const reviews = await db.select().from(t.gradingReviews).where(eq(t.gradingReviews.attemptId, updated.id));
    review = updated.servedItems.map((served) => {
      const q = byId.get(served.questionId)!;
      const answer = unmapAnswer(q, served, (updated.answers as Record<string, Answer>)[served.questionId]);
      const earned = q.type === "free_text" ? null : scoreQuestion({ type: q.type, points: q.points, body: q.body }, answer);
      return {
        questionId: q.id,
        prompt: q.body.prompt,
        correct: earned === null ? null : earned >= q.points,
        explanation: q.body.explanation ?? null,
        sourceStartSec: q.body.sourceStartSec ?? q.source?.startSec ?? null,
        rationale: reviews.find((r) => r.questionId === q.id)?.aiRationale ?? null,
      };
    });
  }

  return Response.json({
    state: updated.state,
    gradingState: updated.gradingState,
    scorePct: updated.maxScore ? Math.round(((updated.score ?? 0) / updated.maxScore) * 100) : 0,
    passed: updated.passed,
    reveal,
    review,
  });
}
