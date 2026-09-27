import { Icon } from "@/components/icons";
import { CourseCover } from "@/components/course-cover";
import { LearningProgress } from "@/components/course-card";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { buildCourseOutline } from "@/lib/lms/course-outline";
import { pathPrerequisite } from "@/lib/lms/path-access";
import { CourseOutline } from "@/components/course-outline";
import { ButtonLink, Chip, PageTitle, PillLink, complianceChip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ outline?: string }>;
}) {
  const user = await requireUser();
  const { courseId } = await params;
  const { outline } = await searchParams;
  const expandAll = outline === "all";

  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId)).limit(1);
  if (!course || course.status !== "PUBLISHED") notFound();

  const pathLock = await pathPrerequisite(user.id, courseId);
  if (pathLock) return <div><PageTitle sub={`Complete the earlier courses in “${pathLock.title}” to unlock this course.`}>{course.title}</PageTitle><ButtonLink href={`/path/${pathLock.pathId}`}>View learning path</ButtonLink></div>;

  const view = await buildCourseOutline({
    courseId,
    userId: user.id,
    sequentialLock: course.sequentialLock,
    expandAll,
  });

  const [enrollment] = await db
    .select()
    .from(t.enrollments)
    .where(
      and(
        eq(t.enrollments.userId, user.id),
        eq(t.enrollments.courseId, courseId),
        inArray(t.enrollments.status, ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]),
      ),
    )
    .limit(1);
  const [cert] = await db
    .select()
    .from(t.certificates)
    .where(and(eq(t.certificates.userId, user.id), eq(t.certificates.courseId, courseId)))
    .limit(1);

  const chip = enrollment ? complianceChip(enrollment.complianceStatus) : null;
  // The toggle only means something once a section has folded itself away.
  const showExpandToggle = expandAll || view.modules.some((m) => m.complete);

  return (
    <div>
      <div className="mb-8 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold sm:text-[32px]">{course.title}</h1>
          {chip ? <Chip variant={chip.variant}>{chip.label}</Chip> : null}
        </div>
        <p className="mb-4 max-w-2xl text-muted">{course.description}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-sm text-muted">{course.estMinutes} min · {course.language.toUpperCase()}</span>
          {enrollment?.dueAt ? <Chip variant="neutral">Due {enrollment.dueAt.toISOString().slice(0, 10)}</Chip> : null}
          {course.sequentialLock ? <Chip variant="neutral">Complete in order</Chip> : null}
        </div>
        {course.objectives.length > 0 ? (
          <section className="mb-6 max-w-2xl">
            <h2 className="mb-3 text-lg font-semibold">You will learn to</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {course.objectives.map((o) => (
                <li key={o} className="flex gap-2"><Icon name="check" size={16} className="mt-1 shrink-0 text-success-fg" />{o}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          {view.total > 0 ? (
            <div className="flex items-center gap-3">
              <div>
                <span className="block text-sm font-medium">
                  {view.doneCount} of {view.total} lessons
                </span>
                {view.minutesLeft ? (
                  <span className="block text-xs text-muted">
                    {view.minutesLeft} min{view.minutesLeftPartial ? "+" : ""} left
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {view.nextLessonId ? (
              <ButtonLink href={`/lesson/${view.nextLessonId}`}>
                {view.doneCount > 0 ? "Continue" : "Start course"}
              </ButtonLink>
            ) : null}
            {cert ? (
              <ButtonLink variant="secondary" href={`/api/certificates/${cert.id}`}>Download certificate</ButtonLink>
            ) : null}
          </div>
        </div>
        {view.total > 0 ? <div className="mt-5 max-w-md"><LearningProgress pct={view.pct} label={`${view.pct}% complete`} /></div> : <p className="mt-4 text-sm text-muted">Lessons are being prepared. Check back soon.</p>}
        {!enrollment ? <p className="mt-3 text-sm text-muted">Available to explore. This course is not currently assigned to you.</p> : null}
      </div>
      <CourseCover title={course.title} coverUrl={course.coverUrl} tags={course.tags} priority className="rounded-card" />
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Course contents</h2>
        {showExpandToggle ? (
          <PillLink href={expandAll ? `/course/${courseId}` : `/course/${courseId}?outline=all`} active={expandAll}>
            {expandAll ? "Collapse finished" : "Expand all"}
          </PillLink>
        ) : null}
      </div>
      <CourseOutline view={view} variant="page" />
    </div>
  );
}
