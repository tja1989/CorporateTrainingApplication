import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { myCourses, recommend } from "@/lib/lms/queries";
import { buildCourseOutline } from "@/lib/lms/course-outline";
import { coursePlanningAccess } from "@/lib/lms/planning-access";
import { pathPrerequisite } from "@/lib/lms/path-access";
import { flatLessons } from "@/lib/lms/outline";
import { CourseCover } from "@/components/course-cover";
import { CourseCard, LearningProgress } from "@/components/course-card";
import {
  Card,
  ButtonLink,
  EmptyState,
  DemoBanner,
  SectionTitle,
  StatusChip,
} from "@/components/ui";
import { formatDay, formatDue } from "@/lib/format";
import { lessonTypeLabel } from "@/components/lesson-icon";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const user = await requireUser();
  const mine = await myCourses(user.id);
  const pathLocks = await Promise.all(
    mine.map((c) => pathPrerequisite(user.id, c.course.id)),
  );
  const planning = await Promise.all(
    mine.map((c) => coursePlanningAccess(user.id, c.course.id)),
  );
  const available = mine.filter(
    (_, index) => !pathLocks[index] && !planning[index].blocked,
  );
  const upcoming = mine
    .filter(
      (c, index) =>
        c.enrollment?.status !== "COMPLETED" &&
        planning[index].blocked &&
        planning[index].reason === "scheduled",
    )
    .sort(
      (a, b) => a.course.startsAt!.getTime() - b.course.startsAt!.getTime(),
    );
  const allAssignedDone = mine.length > 0 && mine.every((c) => c.pct === 100);
  const candidates = [
    ...available.filter((c) => c.enrollment?.status === "IN_PROGRESS"),
    ...available.filter((c) => c.enrollment?.status === "NOT_STARTED"),
  ];
  const outlines = await Promise.all(
    candidates.map((c) =>
      buildCourseOutline({
        courseId: c.course.id,
        userId: user.id,
        sequentialLock: c.course.sequentialLock,
      }),
    ),
  );
  const resumeIndex = outlines.findIndex((o) => !!o.nextLessonId);
  const resume = candidates[resumeIndex];
  const outline = outlines[resumeIndex];
  const next = outline
    ? flatLessons(outline).find((l) => l.id === outline.nextLessonId)
    : null;
  const due = mine
    .filter((c) =>
      ["DUE_SOON", "OVERDUE"].includes(c.enrollment?.complianceStatus ?? ""),
    )
    .sort(
      (a, b) =>
        (a.enrollment?.dueAt?.getTime() ?? Infinity) -
        (b.enrollment?.dueAt?.getTime() ?? Infinity),
    );
  const recs = recommend(available).filter(
    (r) => r.course.id !== resume?.course.id,
  );
  const [paths, links] = await Promise.all([
    db.select().from(t.paths),
    db.select().from(t.pathCourses),
  ]);
  const ids = new Set(mine.map((c) => c.course.id));
  const myPaths = paths.filter((p) =>
    links.some((l) => l.pathId === p.id && ids.has(l.courseId)),
  );
  const firstName = user.name.split(" ")[0];
  const pathProgress = (pathId: string) => {
    const courseIds = links.filter((l) => l.pathId === pathId).map((l) => l.courseId);
    const done = courseIds.filter((id) => mine.find((c) => c.course.id === id)?.pct === 100).length;
    return { done, total: courseIds.length };
  };
  return (
    <div>
      <DemoBanner />
      <header className="mb-8">
        <h1 className="type-display">Welcome back, {firstName}</h1>
        <p className="mt-2 max-w-[60ch] text-base text-muted">
          {resume && outline
            ? `You're ${outline.doneCount} of ${outline.total} lessons into ${resume.course.title}.`
            : "Your next step in learning."}
        </p>
      </header>
      {resume && next ? (
        <section aria-labelledby="continue-heading" className="mb-10">
          <h2 id="continue-heading" className="sr-only">
            Continue learning
          </h2>
          <Card className="overflow-hidden shadow-[var(--shadow-resting)] md:grid md:grid-cols-[minmax(260px,5fr)_7fr]">
            <CourseCover
              title={resume.course.title}
              coverUrl={resume.course.coverUrl}
              tags={resume.course.tags}
              priority
              className="course-cover-fill"
            />
            <div className="flex flex-col gap-4 p-6 sm:p-8">
              <p className="text-sm font-medium text-muted">{resume.course.title}</p>
              <h3 className="type-title">{next.title}</h3>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span>
                  {lessonTypeLabel(next.type)}
                  {next.minutes ? `, about ${next.minutes} min` : ""}
                </span>
                {resume.enrollment?.dueAt && resume.enrollment.status !== "COMPLETED" ? (
                  <span className="font-medium text-warning-fg">{formatDue(resume.enrollment.dueAt)}</span>
                ) : null}
              </p>
              <LearningProgress
                pct={outline.pct}
                label={`${outline.doneCount} of ${outline.total} lessons complete`}
              />
              <div className="mt-1">
                <ButtonLink href={next.href} className="min-h-12 px-6 text-base">
                  Continue lesson
                </ButtonLink>
              </div>
            </div>
          </Card>
        </section>
      ) : (
        <div className="mb-10">
          <EmptyState
            title={
              upcoming.length
                ? "Your training is scheduled"
                : allAssignedDone
                  ? "Your assigned learning is complete"
                  : mine.length
                    ? "Your next lesson is not available yet"
                    : "Your learning starts here"
            }
            body={
              upcoming.length
                ? `Your next course opens ${formatDay(upcoming[0].course.startsAt!)}. You can review the schedule now.`
                : allAssignedDone
                  ? "Explore more courses or revisit completed training in My Learning."
                  : mine.length
                    ? "Check your learning paths for prerequisites, or contact your training team if a course is still being prepared."
                    : "Assigned training will appear here. You can explore published courses now."
            }
            action={
              upcoming.length ? (
                <ButtonLink href="/learn?view=upcoming">
                  View upcoming training
                </ButtonLink>
              ) : (
                <ButtonLink href="/learn?view=browse">Browse courses</ButtonLink>
              )
            }
          />
        </div>
      )}
      {due.length ? (
        <section className="mb-10" aria-labelledby="required-heading">
          <SectionTitle className="mb-2">
            <span id="required-heading">Required training</span>
          </SectionTitle>
          <ul className="divide-y divide-border border-y border-border">
            {due.map((c) => (
              <li key={c.course.id}>
                <Link
                  href={`/course/${c.course.id}`}
                  className="-mx-2 flex items-center gap-4 rounded-control px-2 py-3 hover:bg-surface-2"
                >
                  <CourseCover
                    title={c.course.title}
                    coverUrl={c.course.coverUrl}
                    tags={c.course.tags}
                    className="course-cover-compact w-16 shrink-0 rounded-input"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-foreground">{c.course.title}</h3>
                    <p className="text-sm text-muted">
                      {c.enrollment?.dueAt ? formatDue(c.enrollment.dueAt) : "Assigned training"}
                    </p>
                  </div>
                  <StatusChip status={c.enrollment!.complianceStatus} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {myPaths.length ? (
        <section className="mb-10" aria-labelledby="paths-heading">
          <SectionTitle>
            <span id="paths-heading">Your learning paths</span>
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {myPaths.map((p) => {
              const { done, total } = pathProgress(p.id);
              return (
                <Link key={p.id} href={`/path/${p.id}`} className="block rounded-card">
                  <Card interactive className="flex h-full flex-col gap-3 p-5">
                    <h3 className="type-section text-lg">{p.title}</h3>
                    {p.description ? <p className="text-sm text-muted">{p.description}</p> : null}
                    <div className="mt-auto">
                      <LearningProgress
                        pct={total ? Math.round((done / total) * 100) : 0}
                        label={`${done} of ${total} courses complete`}
                      />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
      {recs.length ? (
        <section className="mb-8" aria-labelledby="recommended-heading">
          <SectionTitle>
            <span id="recommended-heading">Recommended for you</span>
          </SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recs.map((r) => (
              <CourseCard
                key={r.course.id}
                course={r.course}
                reason={r.reason}
              />
            ))}
          </div>
        </section>
      ) : null}
      <section
        className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-5"
        aria-label="Optional practice"
      >
        <div>
          <h2 className="type-section text-lg">Keep your knowledge fresh</h2>
          <p className="text-sm text-muted">
            Optional daily practice unlocks after your first completed lesson.
          </p>
        </div>
        <ButtonLink variant="secondary" href="/drill">
          Open Practice
        </ButtonLink>
      </section>
    </div>
  );
}
