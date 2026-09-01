import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { courseProgress } from "@/lib/lms/queries";
import { Card, Chip, PageTitle, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PathPage({ params }: { params: Promise<{ pathId: string }> }) {
  const user = await requireUser();
  const { pathId } = await params;
  const [path] = await db.select().from(t.paths).where(eq(t.paths.id, pathId)).limit(1);
  if (!path) notFound();
  const links = (await db.select().from(t.pathCourses).where(eq(t.pathCourses.pathId, pathId))).sort((a, b) => a.sort - b.sort);
  const courses = links.length
    ? await db.select().from(t.courses).where(inArray(t.courses.id, links.map((l) => l.courseId)))
    : [];
  const byId = new Map(courses.map((c) => [c.id, c]));
  const progress = await courseProgress(user.id, links.map((l) => l.courseId));

  let previousDone = true;
  return (
    <div className="animate-slide-up">
      <PageTitle sub={path.description || (path.completeInOrder ? "Complete these courses in order." : "Complete these courses in any order.")}>
        {path.title}
      </PageTitle>
      <ol className="flex max-w-2xl flex-col gap-2">
        {links.map((link, i) => {
          const course = byId.get(link.courseId);
          if (!course) return null;
          const p = progress.get(course.id) ?? { total: 0, done: 0 };
          const complete = p.total > 0 && p.done === p.total;
          const locked = path.completeInOrder && !previousDone;
          const row = (
            <Card
              className={cx("flex items-center gap-3 p-3", locked ? "opacity-50" : "pressable hover:bg-surface-2")}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-xs font-medium">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{course.title}</span>
                <span className="text-xs text-muted">{p.done}/{p.total} lessons</span>
              </div>
              {complete ? <Chip variant="success">Done</Chip> : locked ? <Chip variant="neutral">Locked</Chip> : null}
            </Card>
          );
          previousDone = previousDone && complete;
          return (
            <li key={link.id}>
              {locked ? row : <Link href={`/course/${course.id}`}>{row}</Link>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
