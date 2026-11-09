import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { learnerLockNote, loadPreviewCourse } from "@/lib/preview/course";
import { flatLessons, lessonNeighbours } from "@/lib/lms/outline";
import { quizIntroFigures } from "@/lib/quiz/intro-figures";
import { Markdown } from "@/lib/markdown";
import { CourseOutline } from "@/components/course-outline";
import { lessonTypeLabel } from "@/components/lesson-icon";
import { PreviewBanner } from "@/components/preview-banner";
import { PreviewVideo } from "@/components/preview-video";
import { Button, ButtonLink, Card, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

const SCOPE_LABEL = { previous: "the previous lesson", module: "the lessons in this module", course: "everything in this course" } as const;

export default async function PreviewLessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params;
  const preview = await loadPreviewCourse(await requireUser(), courseId);
  if (!preview) notFound();
  const lesson = preview.lessons.find((l) => l.id === lessonId);
  if (!lesson) notFound();
  const { course, view, backHref } = preview;
  const mod = preview.modules.find((m) => m.id === lesson.moduleId);
  const self = flatLessons(view).find((l) => l.id === lesson.id);
  const { prev, next, index, total } = lessonNeighbours(view, lesson.id);
  const lockNote = learnerLockNote(course, index);

  const [video] = lesson.type === "VIDEO" && lesson.payload.videoId
    ? await db.select({ youtubeId: t.videos.youtubeId, ingestionStatus: t.videos.ingestionStatus, failureReason: t.videos.failureReason }).from(t.videos).where(eq(t.videos.id, lesson.payload.videoId)).limit(1)
    : [];
  const [quiz] = lesson.type === "QUIZ" && lesson.payload.quizId
    ? await db.select({ settings: t.quizzes.settings }).from(t.quizzes).where(eq(t.quizzes.id, lesson.payload.quizId)).limit(1)
    : [];
  const cfg = lesson.payload.interview;

  return (
    <div>
      <PreviewBanner backHref={backHref} />
      <nav className="mb-3 flex flex-wrap items-center text-sm text-muted" aria-label="Breadcrumb">
        <Link className="touch-target inline-flex max-w-full items-center hover:underline" href={`/preview/course/${course.id}`}>{course.title}</Link>
        <span className="mx-2" aria-hidden>/</span>
        {mod?.title}
      </nav>
      <div className="mb-5">
        <p className="mb-1 text-sm text-muted">
          Lesson {index + 1} of {total} · {lessonTypeLabel(lesson.type)}
          {self?.minutes ? ` · ${self.minutes} min` : ""}
        </p>
        <h1 className="type-title">{lesson.title}</h1>
        {lockNote ? <p className="mt-2 text-sm text-muted">{lockNote}</p> : null}
      </div>
      <div className="lesson-workspace">
        <div className="min-w-0">
          {lesson.type === "TEXT" ? (
            <Card className="mb-6 p-5 sm:p-8">
              <div className="max-w-[72ch]">
                <Markdown text={lesson.payload.body ?? ""} headingOffset={1} />
              </div>
            </Card>
          ) : null}
          {lesson.type === "PDF" ? (
            <Card className="mb-6 p-4">
              {lesson.payload.fileUrl ? (
                <>
                  <iframe src={lesson.payload.fileUrl} title={lesson.title} className="h-[65vh] w-full rounded-control border border-border" />
                  <p className="mt-3 text-sm text-muted">
                    Document not showing?{" "}
                    <a className="link text-link" href={lesson.payload.fileUrl} target="_blank" rel="noreferrer">Open document in a new tab</a>.
                  </p>
                </>
              ) : (
                <p className="text-muted">The document is unavailable. Contact your training team to restore it.</p>
              )}
            </Card>
          ) : null}
          {lesson.type === "VIDEO" ? <PreviewVideo title={lesson.title} video={video ?? null} /> : null}
          {lesson.type === "INTERVIEW" ? (
            <Card className="mb-6 max-w-3xl p-6">
              {cfg ? (
                <p className="mb-4 text-sm text-muted">
                  A spoken check on {SCOPE_LABEL[cfg.scope] ?? SCOPE_LABEL.module}: up to {cfg.questionCount} questions, pass mark {cfg.passPct}%.
                  {cfg.requirePass ? " Passing completes this lesson." : " Finishing the check completes this lesson."}
                </p>
              ) : null}
              <Button disabled>Start oral check</Button>
              <p className="mt-3 text-sm text-muted">Voice oral checks don&#39;t run in preview.</p>
            </Card>
          ) : null}
          {lesson.type === "QUIZ" ? (
            <Card className="mb-6 p-6">
              {quiz ? (
                <>
                  <h2 className="mb-2 text-lg font-semibold">Check your understanding</h2>
                  <p className="mb-4 text-muted">Check the rules below. Opening the assessment lets you take it and see how it scores. Nothing is saved.</p>
                  <dl className="mb-5 grid max-w-lg grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-3">
                    {quizIntroFigures(quiz.settings, 1, 0).map(([term, value]) => (
                      <div key={term} className="rounded-control bg-surface-2 p-3">
                        <dt className="text-xs text-muted">{term}</dt>
                        <dd className="type-number mt-1 text-lg text-foreground [overflow-wrap:normal]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <ButtonLink href={`/preview/course/${course.id}/quiz/${lesson.id}`}>Open assessment</ButtonLink>
                </>
              ) : (
                <p className="text-muted">The assessment is being prepared. Check back soon.</p>
              )}
            </Card>
          ) : null}
          <nav className="flex flex-wrap justify-between gap-3" aria-label="Lesson navigation">
            {prev ? (
              <ButtonLink variant="ghost" href={prev.href}><Icon name="arrow-left" size={16} />Previous lesson</ButtonLink>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-3">
              <ButtonLink variant="ghost" href={`/preview/course/${course.id}`}><Icon name="book" size={16} />Course overview</ButtonLink>
              {next ? <ButtonLink href={next.href}>Next lesson</ButtonLink> : null}
            </div>
          </nav>
          <div className="mt-6 min-[1200px]:hidden">
            <CourseOutline view={view} variant="panel" />
          </div>
        </div>
        <aside className="lesson-contents-panel sticky top-20 max-h-[calc(100dvh-112px)] min-w-0 self-start overflow-y-auto rounded-card border border-border bg-surface p-4">
          <h2 className="type-section mb-3">Course contents</h2>
          <CourseOutline view={view} variant="rail" />
        </aside>
      </div>
    </div>
  );
}
