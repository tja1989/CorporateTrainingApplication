import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { courseOutline, isLessonLocked } from "@/lib/lms/queries";
import { Card, Chip, ButtonLink, complianceChip, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const TYPE_ICON: Record<string, string> = { VIDEO: "▶", TEXT: "¶", PDF: "▦", QUIZ: "☑" };

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser();
  const { courseId } = await params;
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId)).limit(1);
  if (!course || course.status !== "PUBLISHED") notFound();

  const outline = await courseOutline(courseId);
  const lessonIds = outline.flatMap((o) => o.lessons.map((l) => l.id));
  const progress = lessonIds.length
    ? await db
        .select()
        .from(t.lessonProgress)
        .where(and(eq(t.lessonProgress.userId, user.id), inArray(t.lessonProgress.lessonId, lessonIds)))
    : [];
  const done = new Set(progress.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId));

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

  const firstIncomplete = outline.flatMap((o) => o.lessons).find((l) => !done.has(l.id));
  const chip = enrollment ? complianceChip(enrollment.complianceStatus) : null;

  return (
    <div className="animate-slide-up">
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium">{course.title}</h1>
          {chip ? <Chip variant={chip.variant}>{chip.label}</Chip> : null}
        </div>
        <p className="mb-3 max-w-2xl text-sm text-muted">{course.description}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip variant="neutral">~{course.estMinutes} min</Chip>
          {enrollment?.dueAt ? <Chip variant="neutral">Due {enrollment.dueAt.toISOString().slice(0, 10)}</Chip> : null}
          {course.sequentialLock ? <Chip variant="neutral">Complete in order</Chip> : null}
        </div>
        {course.objectives.length > 0 ? (
          <Card className="mb-4 max-w-2xl p-4">
            <h2 className="mb-2 text-sm font-medium text-muted">You will learn to</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {course.objectives.map((o) => (
                <li key={o} className="flex gap-2"><span className="text-primary" aria-hidden>✓</span>{o}</li>
              ))}
            </ul>
          </Card>
        ) : null}
        <div className="flex gap-2">
          {firstIncomplete ? (
            <ButtonLink href={`/lesson/${firstIncomplete.id}`}>{done.size > 0 ? "Continue" : "Start course"}</ButtonLink>
          ) : null}
          {cert ? (
            <ButtonLink variant="secondary" href={`/api/certificates/${cert.id}`}>Download certificate</ButtonLink>
          ) : null}
        </div>
      </div>

      <div className="flex max-w-2xl flex-col gap-4">
        {outline.map(({ module, lessons }) => (
          <Card key={module.id} className="p-4">
            <h2 className="mb-3 font-medium">{module.title}</h2>
            <ul className="flex flex-col gap-1">
              {lessons.map((lesson) => {
                const locked = isLessonLocked(outline, done, lesson.id, course.sequentialLock);
                const isDone = done.has(lesson.id);
                return (
                  <li key={lesson.id}>
                    <Link
                      href={locked ? "#" : `/lesson/${lesson.id}`}
                      aria-disabled={locked}
                      className={cx(
                        "flex items-center gap-3 rounded-control px-2 py-2 text-sm",
                        locked ? "pointer-events-none opacity-50" : "hover:bg-surface-2",
                      )}
                    >
                      <span aria-hidden className={isDone ? "text-success-fg" : "text-muted"}>
                        {isDone ? "●" : TYPE_ICON[lesson.type] ?? "○"}
                      </span>
                      <span className="flex-1">{lesson.title}</span>
                      {locked ? <span className="text-xs text-muted">locked</span> : null}
                      {isDone ? <span className="text-xs text-success-fg">done</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
