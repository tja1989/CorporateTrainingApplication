import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { learnerQuizLesson } from "@/lib/lms/lesson-access";
import { startAttempt, canStart } from "@/lib/quiz/engine";

/** Start (or resume) an attempt; serves question bodies WITHOUT answer keys. */
export async function POST(_req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { quizId } = await params;
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, quizId)).limit(1);
  if (!quiz) return new Response("Not found", { status: 404 });

  const access = await learnerQuizLesson(user.id, quiz);
  if (access !== undefined) {
    if (!access) return Response.json({ error: "This course is not available." }, { status: 404 });
    if (access.self.locked) return Response.json({ error: "Complete the previous lessons first." }, { status: 403 });
  }
  if (quiz.settings.integrityMode) {
    const [consent] = await db.select({ id: t.consents.id }).from(t.consents).where(and(eq(t.consents.userId, user.id), eq(t.consents.kind, "integrity"), eq(t.consents.version, `quiz:${quiz.id}`))).limit(1);
    if (!consent) return Response.json({ error: "Review and acknowledge the assessment recording information first." }, { status: 403 });
  }
  const check = await canStart(quiz, user.id);
  if (!check.ok) return Response.json({ error: check.reason }, { status: 403 });

  const attempt = await startAttempt(quiz, { id: user.id, timeMultiplier: user.timeMultiplier });
  const questions = await db
    .select()
    .from(t.questions)
    .where(inArray(t.questions.id, attempt.servedItems.map((s) => s.questionId)));
  const byId = new Map(questions.map((q) => [q.id, q]));

  const served = attempt.servedItems.map((s) => {
    const q = byId.get(s.questionId)!;
    const co = s.choiceOrder;
    const displayOptions = (arr?: string[]) => (arr && co ? co.map((actual) => arr[actual]) : arr);
    return {
      questionId: q.id,
      type: q.type,
      points: q.points,
      prompt: q.body.prompt,
      stimulus: q.body.stimulus ?? null,
      options: q.type === "truefalse" ? ["True", "False"] : displayOptions(q.body.options),
      left: q.body.pairs?.map((p) => p.left) ?? null,
      right: co && q.body.pairs ? co.map((actual) => q.body.pairs![actual].right) : (q.body.pairs?.map((p) => p.right) ?? null),
      orderItems: co && q.body.orderItems ? co.map((actual) => q.body.orderItems![actual]) : (q.body.orderItems ?? null),
    };
  });

  return Response.json({
    attemptId: attempt.id,
    served,
    answers: attempt.answers,
    deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
    settings: {
      oneAtATime: quiz.settings.oneAtATime,
      noBacktrack: quiz.settings.noBacktrack,
      feedbackMode: quiz.settings.feedbackMode,
      integrityMode: quiz.settings.integrityMode,
      passPct: quiz.settings.passPct,
      graceSec: quiz.settings.graceSec,
    },
  });
}
