import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { resultStatus } from "@/lib/quiz/client-state";
import { learnerQuizLesson } from "@/lib/lms/lesson-access";
import { requireUser } from "@/lib/auth/guard";
import { canStart, currentQuizAttempts, windowState } from "@/lib/quiz/engine";
import { Card, PageTitle, Chip, ButtonLink } from "@/components/ui";
import { QuizRunner } from "./runner";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const user = await requireUser();
  const { quizId } = await params;
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, quizId)).limit(1);
  if (!quiz) notFound();
  const access = await learnerQuizLesson(user.id, quiz);
  if (access !== undefined) {
    if (!access) notFound();
    if (access.self.locked) return <div><PageTitle sub="Complete the earlier lessons before taking this assessment.">{quiz.title}</PageTitle><ButtonLink href={`/course/${access.course.id}`}>View course contents</ButtonLink></div>;
  }

  const previous = await currentQuizAttempts(quiz, user.id);
  const counted = previous.filter((a) => a.state !== "VOIDED");
  const attemptsLeft = quiz.settings.attemptsLimit === null ? null : Math.max(0, quiz.settings.attemptsLimit - counted.length);
  const ws = windowState(quiz.settings);
  const timeLimitSec = quiz.settings.timeLimitSec ? Math.round(quiz.settings.timeLimitSec * (user.timeMultiplier || 1)) : null;
  const latest = counted[0];
  const startState = await canStart(quiz, user.id);
  const appealed = latest
    ? (await db
        .select()
        .from(t.gradingReviews)
        .where(and(eq(t.gradingReviews.attemptId, latest.id), eq(t.gradingReviews.reason, "appeal")))
      ).length > 0
    : false;

  return (
    <div className="animate-slide-up mx-auto max-w-2xl">
      <PageTitle sub={quiz.settings.feedbackMode === "EXAM" ? "Assessment — answers are revealed after the window closes." : "Practice quiz — instant feedback."}>
        {quiz.title}
      </PageTitle>
      {quiz.lessonId ? <div className="mb-4"><ButtonLink variant="ghost" href={`/lesson/${quiz.lessonId}`}>Back to lesson</ButtonLink></div> : null}

      <Card className="mb-4 flex flex-wrap gap-2 p-4 text-sm">
        <Chip variant="neutral">Pass mark {quiz.settings.passPct}%</Chip>
        <Chip variant="neutral">{attemptsLeft === null ? "Unlimited attempts" : `${attemptsLeft} attempt(s) left`}</Chip>
        {timeLimitSec ? (
          <Chip variant="neutral">
            {Math.round(timeLimitSec / 60)} min{user.timeMultiplier > 1 ? ` (×${user.timeMultiplier} accommodation)` : ""}
          </Chip>
        ) : null}
        {quiz.settings.integrityMode ? <Chip variant="warning">Integrity monitoring</Chip> : null}
        {ws !== "open" ? <Chip variant="destructive">{ws === "before" ? "Not open yet" : "Window closed"}</Chip> : null}
      </Card>

      {latest && latest.state !== "IN_PROGRESS" ? (
        <Card className="mb-4 p-4 text-sm">
          <p className="mb-1 font-medium">
            Latest result: {latest.maxScore ? Math.round(((latest.score ?? 0) / latest.maxScore) * 100) : 0}%{" "}
            {resultStatus(latest) === "pending" ? (
              <Chip variant="warning">Pending confirmation</Chip>
            ) : resultStatus(latest) === "pass" ? (
              <Chip variant="success">Passed</Chip>
            ) : (
              <Chip variant="destructive">Not passed</Chip>
            )}
          </p>
          {resultStatus(latest) === "pending" ? (
            <p className="text-muted">A reviewer confirms AI-graded answers before this result becomes final.</p>
          ) : null}
        </Card>
      ) : null}

      {!startState.ok ? <p className="mb-4 text-sm text-muted">{startState.reason}</p> : null}
      <QuizRunner
        quizId={quiz.id}
        lessonHref={quiz.lessonId ? `/lesson/${quiz.lessonId}` : undefined}
        windowOpen={startState.ok}
        attemptsLeft={attemptsLeft}
        latestFinalized={latest && latest.state !== "IN_PROGRESS" ? { gradingState: latest.gradingState, appealed } : null}
        resume={previous.some((a) => a.state === "IN_PROGRESS")}
      />
    </div>
  );
}
