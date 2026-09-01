import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { windowState } from "@/lib/quiz/engine";
import { Card, PageTitle, Chip } from "@/components/ui";
import { QuizRunner } from "./runner";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const user = await requireUser();
  const { quizId } = await params;
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, quizId)).limit(1);
  if (!quiz) notFound();

  const previous = await db
    .select()
    .from(t.attempts)
    .where(and(eq(t.attempts.quizId, quiz.id), eq(t.attempts.userId, user.id)))
    .orderBy(desc(t.attempts.startedAt));
  const counted = previous.filter((a) => a.state !== "VOIDED");
  const attemptsLeft = quiz.settings.attemptsLimit === null ? null : Math.max(0, quiz.settings.attemptsLimit - counted.length);
  const ws = windowState(quiz.settings);
  const timeLimitSec = quiz.settings.timeLimitSec ? Math.round(quiz.settings.timeLimitSec * (user.timeMultiplier || 1)) : null;
  const latest = counted[0];
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
            {latest.gradingState === "PROVISIONAL" ? (
              <Chip variant="warning">Pending confirmation</Chip>
            ) : latest.passed ? (
              <Chip variant="success">Passed</Chip>
            ) : (
              <Chip variant="destructive">Not passed</Chip>
            )}
          </p>
          {latest.gradingState === "PROVISIONAL" ? (
            <p className="text-muted">A reviewer confirms AI-graded answers before this result becomes final.</p>
          ) : null}
        </Card>
      ) : null}

      <QuizRunner
        quizId={quiz.id}
        windowOpen={ws === "open"}
        attemptsLeft={attemptsLeft}
        latestFinalized={latest && latest.state !== "IN_PROGRESS" ? { gradingState: latest.gradingState, appealed } : null}
        resume={previous.some((a) => a.state === "IN_PROGRESS")}
      />
    </div>
  );
}
