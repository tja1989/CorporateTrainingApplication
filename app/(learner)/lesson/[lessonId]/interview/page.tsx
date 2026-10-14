import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { learnerLesson } from "@/lib/lms/lesson-access";
import { liveAvailable } from "@/lib/live/gemini";
import { PASS_PCT, QUESTION_COUNT, maxMinutesFor } from "@/lib/live/interview";
import { latestInterviewsByLesson, loadLessonContent } from "@/lib/live/store";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { OralCheck } from "./interview";

export const dynamic = "force-dynamic";

/** Oral check after a lesson (spec FR-14.2, §11): optional, non-gating, AI-interviewed. */
export default async function InterviewPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const user = await requireUser();
  const { lessonId } = await params;
  const access = await learnerLesson(user.id, lessonId);
  if (!access) notFound();
  if (access.self.locked) return <EmptyState title="Finish the earlier learning first" body="This oral check opens after the course and lesson prerequisites are complete." action={<ButtonLink href={access.pathLock ? `/path/${access.pathLock.pathId}` : `/course/${access.course.id}`}>View prerequisites</ButtonLink>} />;
  const loaded = await loadLessonContent(lessonId);
  if (!loaded || loaded.course.status !== "PUBLISHED") notFound();
  if (loaded.lesson.type === "INTERVIEW") redirect(`/lesson/${lessonId}`);
  const backHref = `/lesson/${lessonId}`;
  const [progress] = await db
    .select({ status: t.lessonProgress.status })
    .from(t.lessonProgress)
    .where(and(eq(t.lessonProgress.userId, user.id), eq(t.lessonProgress.lessonId, lessonId)))
    .limit(1);
  const done = progress?.status === "COMPLETED";
  const latest = (await latestInterviewsByLesson(user.id, [lessonId])).get(lessonId) ?? null;

  if (!loaded.content) {
    return (
      <EmptyState
        icon="mic"
        tone="ai"
        title="No oral check for this lesson"
        body="Oral checks run on video lessons with a transcript and on text lessons."
        action={<ButtonLink href={backHref}>Return to lesson</ButtonLink>}
      />
    );
  }
  if (!done) {
    return (
      <EmptyState
        icon="mic"
        tone="ai"
        title="Finish the lesson first"
        body="The oral check opens once the lesson is complete."
        action={<ButtonLink href={`/lesson/${lessonId}`}>Open the lesson</ButtonLink>}
      />
    );
  }
  return (
    <div className="animate-slide-up">
      <PageHeader
        title="Oral check"
        sub={`${loaded.lesson.title} · ${loaded.course.title}`}
        actions={
          <ButtonLink variant="secondary" href={backHref}>
            Return to lesson
          </ButtonLink>
        }
      />
      <OralCheck
        lessonId={lessonId}
        configured={liveAvailable()}
        questionCount={QUESTION_COUNT}
        maxMinutes={maxMinutesFor(user.timeMultiplier)}
        passPct={PASS_PCT}
        backHref={backHref}
        previous={
          latest && latest.state === "COMPLETED"
            ? {
                scorePct: latest.scorePct,
                outcome: latest.outcome,
                evaluation: latest.evaluation,
                evaluationSource: latest.evaluationSource,
                completedAt: latest.completedAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </div>
  );
}
