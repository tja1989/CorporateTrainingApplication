import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import {
  AttemptWriteError,
  saveAnswers,
  submitAttempt,
  canRevealAnswers,
  unmapAnswer,
} from "@/lib/quiz/engine";
import { type Answer } from "@/lib/quiz/scoring";
import { reviewItem } from "@/lib/quiz/review";
import { CoursePlanningBlocked } from "@/lib/lms/planning-access";

/**
 * PATCH = autosave answers (+ integrity events); POST = submit.
 * Results respect the per-quiz feedback policy (spec FR-6.6).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { attemptId } = await params;
  const [attempt] = await db
    .select()
    .from(t.attempts)
    .where(eq(t.attempts.id, attemptId))
    .limit(1);
  if (!attempt || attempt.userId !== user.id)
    return new Response("Not found", { status: 404 });
  const [quiz] = await db
    .select()
    .from(t.quizzes)
    .where(eq(t.quizzes.id, attempt.quizId))
    .limit(1);
  if (!quiz) return new Response("Not found", { status: 404 });
  const body = (await req.json()) as {
    answers?: Record<string, Answer>;
    navigationIndex?: number;
    events?: Array<{ kind: string; detail?: Record<string, unknown> }>;
  };

  if (body.events && attempt.integrityMode) {
    const severity = (kind: string): "red" | "orange" | "info" =>
      kind === "focus_lost_long"
        ? "red"
        : kind === "blur" ||
            kind === "fullscreen_exit" ||
            kind === "paste_blocked"
          ? "orange"
          : "info";
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

  if (body.answers || body.navigationIndex !== undefined) {
    try {
      await saveAnswers(
        attempt,
        quiz,
        body.answers ?? {},
        body.navigationIndex,
      );
    } catch (err) {
      return Response.json(
        {
          error: err instanceof Error ? err.message : "Save failed",
          submitted: err instanceof AttemptWriteError && err.submitted,
        },
        { status: 409 },
      );
    }
  }
  return Response.json({ ok: true, savedAt: new Date().toISOString() });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { attemptId } = await params;
  const [attempt] = await db
    .select()
    .from(t.attempts)
    .where(eq(t.attempts.id, attemptId))
    .limit(1);
  if (!attempt || attempt.userId !== user.id)
    return new Response("Not found", { status: 404 });

  let updated: typeof attempt;
  try {
    updated = await submitAttempt(attempt.id);
  } catch (error) {
    if (error instanceof CoursePlanningBlocked)
      return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }
  const [quiz] = await db
    .select()
    .from(t.quizzes)
    .where(eq(t.quizzes.id, updated.quizId))
    .limit(1);
  if (!quiz) return new Response("Not found", { status: 404 });
  // Learners always see their own answers marked right or wrong; the answer
  // key and explanations follow the quiz's reveal policy.
  const reveal = canRevealAnswers(quiz.settings);
  const questions = await db
    .select()
    .from(t.questions)
    .where(
      inArray(
        t.questions.id,
        updated.servedItems.map((s) => s.questionId),
      ),
    );
  const byId = new Map(questions.map((q) => [q.id, q]));
  const reviews = await db
    .select()
    .from(t.gradingReviews)
    .where(eq(t.gradingReviews.attemptId, updated.id));
  const review = updated.servedItems.map((served) => {
    const q = byId.get(served.questionId)!;
    const answer = unmapAnswer(
      q,
      served,
      (updated.answers as Record<string, Answer>)[served.questionId],
    );
    return reviewItem(q, answer, {
      reveal,
      sourceStartSec: q.body.sourceStartSec ?? q.source?.startSec ?? null,
      rationale:
        reviews.find((r) => r.questionId === q.id)?.aiRationale ?? null,
    });
  });

  return Response.json({
    state: updated.state,
    gradingState: updated.gradingState,
    scorePct: updated.maxScore
      ? Math.round(((updated.score ?? 0) / updated.maxScore) * 100)
      : 0,
    passed: updated.passed,
    reveal,
    review,
  });
}
