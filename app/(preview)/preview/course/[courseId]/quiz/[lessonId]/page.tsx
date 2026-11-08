import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { loadPreviewCourse } from "@/lib/preview/course";
import { PreviewBanner } from "@/components/preview-banner";
import { PreviewQuizRunner } from "@/components/preview-quiz-runner";

export const dynamic = "force-dynamic";

export default async function PreviewQuizPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params;
  const preview = await loadPreviewCourse(await requireUser(), courseId);
  if (!preview) notFound();
  const lesson = preview.lessons.find((l) => l.id === lessonId);
  if (!lesson || lesson.type !== "QUIZ" || !lesson.payload.quizId) notFound();
  const [quiz] = await db.select({ settings: t.quizzes.settings }).from(t.quizzes).where(eq(t.quizzes.id, lesson.payload.quizId)).limit(1);
  if (!quiz) notFound();
  const s = quiz.settings;
  return (
    <div>
      <PreviewBanner backHref={preview.backHref} />
      <nav className="mb-3 flex flex-wrap items-center text-sm text-muted" aria-label="Breadcrumb">
        <Link className="touch-target inline-flex max-w-full items-center hover:underline" href={`/preview/course/${courseId}`}>{preview.course.title}</Link>
        <span className="mx-2" aria-hidden>/</span>
        <Link className="touch-target inline-flex max-w-full items-center hover:underline" href={`/preview/course/${courseId}/lesson/${lessonId}`}>{lesson.title}</Link>
      </nav>
      <h1 className="type-title mb-5">{lesson.title}</h1>
      <div className="max-w-3xl">
        <PreviewQuizRunner
          courseId={courseId}
          lessonId={lessonId}
          lessonHref={`/preview/course/${courseId}/lesson/${lessonId}`}
          rules={{ attemptsLimit: s.attemptsLimit, integrityMode: s.integrityMode, exam: s.feedbackMode === "EXAM" }}
        />
      </div>
    </div>
  );
}
