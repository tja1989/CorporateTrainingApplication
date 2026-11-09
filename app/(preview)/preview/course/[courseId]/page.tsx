import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { loadPreviewCourse } from "@/lib/preview/course";
import { flatLessons } from "@/lib/lms/outline";
import { formatDay, languageName } from "@/lib/format";
import { CourseCover } from "@/components/course-cover";
import { CourseOutline } from "@/components/course-outline";
import { PreviewBanner } from "@/components/preview-banner";
import { Chip, Icon, ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PreviewCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const preview = await loadPreviewCourse(await requireUser(), courseId);
  if (!preview) notFound();
  const { course, view, prerequisites, backHref } = preview;
  const first = flatLessons(view)[0];
  const notes = [
    course.startsAt && course.startsAt.getTime() > Date.now() ? `Opens for learners on ${formatDay(course.startsAt, { withYear: true })}` : null,
    prerequisites.length ? `Learners must first complete: ${prerequisites.map((p) => p.title).join(", ")}` : null,
    course.sequentialLock ? "Learners complete lessons in order." : null,
  ].filter((n): n is string => !!n);

  return (
    <div>
      <PreviewBanner backHref={backHref} />
      <div className="mb-10 grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        <div className="min-w-0">
          <h1 className="type-title mb-2">{course.title}</h1>
          <p className="mb-4 max-w-2xl text-base text-muted">{course.description}</p>
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1"><Icon name="clock" size={16} />{course.estMinutes} min</span>
            <span>{languageName(course.language)}</span>
            {course.sequentialLock ? <Chip variant="neutral">Complete in order</Chip> : null}
          </div>
          {notes.length ? (
            <ul className="mb-5 flex max-w-2xl flex-col gap-1 text-sm">
              {notes.map((n) => <li key={n} className="rounded-control bg-surface-2 px-3 py-2">{n}</li>)}
            </ul>
          ) : null}
          {first ? <ButtonLink href={first.href} size="lg">Start course</ButtonLink> : null}
        </div>
        <CourseCover title={course.title} coverUrl={course.coverUrl} tags={course.tags} priority className="rounded-card shadow-[var(--shadow-resting)]" />
      </div>
      <h2 className="type-section mb-3">Course contents</h2>
      {view.total > 0 ? <CourseOutline view={view} variant="page" /> : <p className="text-sm text-muted">This course has no lessons yet.</p>}
    </div>
  );
}
