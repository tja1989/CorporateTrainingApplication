import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { learnerLesson } from "@/lib/lms/lesson-access";
import { lessonNeighbours } from "@/lib/lms/outline";
import { Markdown } from "@/lib/markdown";
import { Card, PageTitle, ButtonLink } from "@/components/ui";
import { LessonProgressProvider, LiveCourseOutline, LessonCompletion } from "@/components/lesson-progress";
import { LessonContents } from "@/components/lesson-contents";
import { VideoLesson } from "./video-lesson";
import { InterviewLesson } from "./interview-lesson";
export const dynamic = "force-dynamic";
export default async function LessonPage({ params, searchParams }: { params: Promise<{ lessonId: string }>; searchParams: Promise<{ t?: string }> }) {
  const user = await requireUser();
  const { lessonId } = await params;
  const timestamp = Number((await searchParams).t);
  const requestedPosition = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : undefined;
  const access = await learnerLesson(user.id, lessonId);
  if (!access) notFound();
  const { lesson, mod, course, view, self } = access;
  if (access.pathLock) return <div><PageTitle sub={`Complete the earlier courses in “${access.pathLock.title}” to unlock this lesson.`}>{lesson.title}</PageTitle><ButtonLink href={`/path/${access.pathLock.pathId}`}>View learning path</ButtonLink></div>;
  if (self.locked) return <div><PageTitle sub="Complete the previous lessons to unlock this lesson.">{lesson.title}</PageTitle>{view.nextLessonId ? <ButtonLink href={`/lesson/${view.nextLessonId}`}>Open the next available lesson</ButtonLink> : <ButtonLink href={`/course/${course.id}`}>Back to course</ButtonLink>}</div>;
  const { prev, index, total } = lessonNeighbours(view, lesson.id);
  return <LessonProgressProvider key={lesson.id} initialView={view}><div>
    <nav className="mb-3 text-sm text-muted" aria-label="Breadcrumb"><Link className="hover:underline" href={`/course/${course.id}`}>{course.title}</Link><span className="mx-2" aria-hidden>/</span>{mod.title}</nav>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-sm text-muted">Lesson {index + 1} of {total} · {self.type.toLowerCase()}{self.minutes ? ` · ${self.minutes} min` : ""}</p><h1 className="text-2xl font-semibold sm:text-[32px]">{lesson.title}</h1></div><LessonContents view={view} /></div>
    <div className="lesson-workspace">
      <div className="min-w-0">
        {lesson.type === "TEXT" ? <Card className="mb-6 p-5 sm:p-8"><div className="max-w-[72ch]"><Markdown text={lesson.payload.body ?? ""} headingOffset={1} /></div></Card> : null}
        {lesson.type === "PDF" ? <Card className="mb-6 p-4">{lesson.payload.fileUrl ? <><iframe src={lesson.payload.fileUrl} title={lesson.title} className="h-[65vh] w-full rounded-control border border-border" /><p className="mt-3 text-sm text-muted">Document not showing? <a className="link text-link" href={lesson.payload.fileUrl} target="_blank" rel="noreferrer">Open document in a new tab</a>.</p></> : <p className="text-muted">The document is unavailable. Contact your training team to restore it.</p>}</Card> : null}
        {lesson.type === "VIDEO" ? <VideoLesson lesson={lesson} courseId={course.id} isDone={self.done} requestedPosition={requestedPosition} /> : null}
        {lesson.type === "INTERVIEW" ? <InterviewLesson lessonId={lesson.id} userId={user.id} timeMultiplier={user.timeMultiplier} backHref={`/lesson/${lesson.id}`} /> : null}
        {lesson.type === "QUIZ" ? <Card className="mb-6 p-6">{lesson.payload.quizId ? <><h2 className="mb-2 text-lg font-semibold">Check your understanding</h2><p className="mb-4 text-muted">{self.done ? "You have passed this assessment. You can review your result or try again if attempts are available." : "Review the time limit, attempt allowance and consent information before you begin."}</p><ButtonLink href={`/quiz/${lesson.payload.quizId}`}>{self.done ? "Review assessment" : "Open assessment"}</ButtonLink></> : <p className="text-muted">The assessment is being prepared. Check back soon.</p>}</Card> : null}
        <LessonCompletion lessonId={lesson.id} />
        <nav className="flex flex-wrap justify-between gap-3" aria-label="Lesson navigation">{prev && !prev.locked ? <ButtonLink variant="ghost" href={prev.href}>Previous lesson</ButtonLink> : <span />}<ButtonLink variant="ghost" href={`/course/${course.id}`}>Course overview</ButtonLink></nav>
      </div>
      <aside className="lesson-contents-panel sticky top-20 max-h-[calc(100dvh-112px)] min-w-0 self-start overflow-y-auto rounded-card border border-border bg-surface p-4"><h2 className="mb-3 text-lg font-semibold">Course contents</h2><LiveCourseOutline view={view} variant="rail" /></aside>
    </div>
  </div></LessonProgressProvider>;
}
