import { Icon } from "@/components/icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { buildCourseOutline } from "@/lib/lms/course-outline";
import { flatLessons, lessonNeighbours } from "@/lib/lms/outline";
import { Markdown } from "@/lib/markdown";
import { Button, Card, PageTitle, ButtonLink } from "@/components/ui";
import { CourseOutline } from "@/components/course-outline";
import { LockMark } from "@/components/lesson-icon";
import { markCompleteAction } from "../actions";
import { VideoLesson } from "./video-lesson";
import { InterviewLesson } from "./interview-lesson";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const user = await requireUser();
  const { lessonId } = await params;
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson) notFound();
  const [mod] = await db.select().from(t.modules).where(eq(t.modules.id, lesson.moduleId)).limit(1);
  if (!mod) notFound();
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, mod.courseId)).limit(1);
  if (!course || course.status !== "PUBLISHED") notFound();

  const view = await buildCourseOutline({
    courseId: course.id,
    userId: user.id,
    sequentialLock: course.sequentialLock,
    currentLessonId: lesson.id,
  });
  const self = flatLessons(view).find((l) => l.id === lesson.id);
  if (self?.locked) {
    return (
      <div className="animate-slide-up">
        <PageTitle sub="Complete the previous lessons first.">{lesson.title}</PageTitle>
        <ButtonLink variant="secondary" href={`/course/${course.id}`}>Back to course</ButtonLink>
      </div>
    );
  }

  const { prev, next } = lessonNeighbours(view, lesson.id);
  const isDone = self?.done ?? false;

  return (
    <div className="animate-slide-up xl:grid xl:grid-cols-[14rem_minmax(0,1fr)] xl:items-start xl:gap-6">
      {/* Persistent course contents from xl up; below that the same outline collapses into the panel under the title. */}
      <aside className="hidden xl:sticky xl:top-12 xl:block">
        <h2 className="mb-2 text-xs font-medium text-muted">Course contents</h2>
        <CourseOutline view={view} variant="rail" />
      </aside>

      <div className="min-w-0">
        <nav className="mb-4 text-sm text-muted" aria-label="Breadcrumb">
          <Link className="hover:underline" href={`/course/${course.id}`}>{course.title}</Link>
          <span className="mx-2" aria-hidden>/</span>
          {mod.title}
        </nav>
        <h1 className="display mb-4 text-xl">{lesson.title}</h1>

        <CourseOutline view={view} variant="panel" className="mb-4 max-w-3xl xl:hidden" />

        {lesson.type === "TEXT" ? (
          <Card className="mb-6 max-w-3xl p-6">
            <Markdown text={lesson.payload.body ?? ""} />
          </Card>
        ) : null}

        {lesson.type === "PDF" ? (
          <Card className="mb-6 max-w-3xl p-4">
            {lesson.payload.fileUrl ? (
              <>
                <iframe src={lesson.payload.fileUrl} title={lesson.title} className="h-[70vh] w-full rounded-card border border-border" />
                {/* Some browsers refuse to render a PDF inline; never dead-end the lesson. */}
                <p className="mt-3 text-sm text-muted">
                  Not showing?{" "}
                  <a className="link text-link" href={lesson.payload.fileUrl} target="_blank" rel="noreferrer">
                    Open it in a new tab
                  </a>
                  .
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">Document unavailable.</p>
            )}
          </Card>
        ) : null}

        {lesson.type === "VIDEO" ? <VideoLesson lesson={lesson} courseId={course.id} isDone={isDone} /> : null}

        {lesson.type === "INTERVIEW" ? (
          <InterviewLesson lessonId={lesson.id} userId={user.id} timeMultiplier={user.timeMultiplier} backHref={`/course/${course.id}`} />
        ) : null}

        {lesson.type === "QUIZ" ? (
          <Card className="mb-6 max-w-3xl p-6">
            {lesson.payload.quizId ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted">This lesson is a quiz{isDone ? " — you have passed it." : "."}</p>
                <ButtonLink href={`/quiz/${lesson.payload.quizId}`}>{isDone ? "Review quiz" : "Start quiz"}</ButtonLink>
              </div>
            ) : (
              <p className="text-sm text-muted">Quiz not configured yet.</p>
            )}
          </Card>
        ) : null}

        <div className="flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            {prev ? <ButtonLink variant="ghost" href={prev.href}><Icon name="arrow-left" size={16} /> {prev.title}</ButtonLink> : null}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {(lesson.type === "TEXT" || lesson.type === "PDF") && !isDone ? (
              <form action={markCompleteAction.bind(null, lesson.id)}>
                <Button type="submit">Mark complete</Button>
              </form>
            ) : null}
            {isDone && lesson.type === "TEXT" ? (
              <ButtonLink variant="secondary" href={`/lesson/${lesson.id}/interview`}>Oral check</ButtonLink>
            ) : null}
            {next ? (
              next.locked ? (
                /* Under a sequential lock the next lesson is often gated; say so rather than
                   linking into the "complete the previous lessons first" screen. */
                <span className="flex min-w-0 items-center gap-2 px-4 py-2 text-sm text-muted">
                  <LockMark />
                  <span className="truncate">{next.title}</span>
                  <span className="sr-only">is locked until the earlier lessons are complete</span>
                </span>
              ) : (
                <ButtonLink variant="ghost" href={next.href}>{next.title} <Icon name="arrow-right" size={16} className="nudge" /></ButtonLink>
              )
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
