import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { courseOutline, isLessonLocked } from "@/lib/lms/queries";
import { Markdown } from "@/lib/markdown";
import { Button, Card, PageTitle, ButtonLink } from "@/components/ui";
import { markCompleteAction } from "../actions";
import { VideoLesson } from "./video-lesson";

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

  const outline = await courseOutline(course.id);
  const allLessons = outline.flatMap((o) => o.lessons);
  const lessonIds = allLessons.map((l) => l.id);
  const progress = await db
    .select()
    .from(t.lessonProgress)
    .where(and(eq(t.lessonProgress.userId, user.id), inArray(t.lessonProgress.lessonId, lessonIds)));
  const done = new Set(progress.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId));
  if (isLessonLocked(outline, done, lesson.id, course.sequentialLock)) {
    return (
      <div className="animate-slide-up">
        <PageTitle sub="Complete the previous lessons first.">{lesson.title}</PageTitle>
        <ButtonLink variant="secondary" href={`/course/${course.id}`}>Back to course</ButtonLink>
      </div>
    );
  }

  const idx = allLessons.findIndex((l) => l.id === lesson.id);
  const prev = idx > 0 ? allLessons[idx - 1] : null;
  const next = idx < allLessons.length - 1 ? allLessons[idx + 1] : null;
  const isDone = done.has(lesson.id);

  return (
    <div className="animate-slide-up">
      <nav className="mb-4 text-sm text-muted" aria-label="Breadcrumb">
        <Link className="hover:underline" href={`/course/${course.id}`}>{course.title}</Link>
        <span className="mx-2" aria-hidden>/</span>
        {mod.title}
      </nav>
      <h1 className="mb-4 text-xl font-medium">{lesson.title}</h1>

      {lesson.type === "TEXT" ? (
        <Card className="mb-6 max-w-3xl p-6">
          <Markdown text={lesson.payload.body ?? ""} />
        </Card>
      ) : null}

      {lesson.type === "PDF" ? (
        <Card className="mb-6 max-w-3xl p-4">
          {lesson.payload.fileUrl ? (
            <iframe src={lesson.payload.fileUrl} title={lesson.title} className="h-[70vh] w-full rounded-card border border-border" />
          ) : (
            <p className="text-sm text-muted">Document unavailable.</p>
          )}
        </Card>
      ) : null}

      {lesson.type === "VIDEO" ? <VideoLesson lesson={lesson} courseId={course.id} isDone={isDone} /> : null}

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
        <div>{prev ? <ButtonLink variant="ghost" href={`/lesson/${prev.id}`}>← {prev.title}</ButtonLink> : null}</div>
        <div className="flex items-center gap-2">
          {(lesson.type === "TEXT" || lesson.type === "PDF") && !isDone ? (
            <form action={markCompleteAction.bind(null, lesson.id)}>
              <Button type="submit">Mark complete</Button>
            </form>
          ) : null}
          {next ? <ButtonLink variant="ghost" href={`/lesson/${next.id}`}>{next.title} →</ButtonLink> : null}
        </div>
      </div>
    </div>
  );
}
