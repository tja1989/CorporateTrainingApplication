import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { myCourses } from "@/lib/lms/queries";
import { Card, Chip, Input, PageTitle, complianceChip, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LearnPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const mine = await myCourses(user.id);

  const pathRows = await db.select().from(t.paths);
  const pathCourseRows = await db.select().from(t.pathCourses);
  const myCourseIds = new Set(mine.map((m) => m.course.id));
  const myPaths = pathRows.filter((p) => pathCourseRows.some((pc) => pc.pathId === p.id && myCourseIds.has(pc.courseId)));

  let results: Array<typeof t.courses.$inferSelect> = [];
  if (q?.trim()) {
    results = await db
      .select()
      .from(t.courses)
      .where(
        sql`${t.courses.status} = 'PUBLISHED' AND (to_tsvector('english', ${t.courses.title} || ' ' || ${t.courses.description}) @@ plainto_tsquery('english', ${q}) OR ${t.courses.title} ILIKE ${"%" + q + "%"})`,
      )
      .limit(20);
  }
  const catalog = await db.select().from(t.courses).where(eq(t.courses.status, "PUBLISHED")).limit(50);

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Your enrolled courses, paths, and the catalog.">Learn</PageTitle>

      <form className="mb-6" action="/learn" method="get" role="search">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search courses…" aria-label="Search courses" />
      </form>

      {q?.trim() ? (
        <section className="mb-8" aria-label="Search results">
          <h2 className="eyebrow mb-2 text-muted">Results for “{q}”</h2>
          {results.length === 0 ? (
            <EmptyState title="No matches" body="Try a different word, or browse the catalog below." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="mb-8" aria-label="My learning">
        <h2 className="eyebrow mb-2 text-muted">My learning</h2>
        {mine.length === 0 ? (
          <EmptyState title="Nothing assigned yet" body="Courses assigned to you will appear here." />
        ) : (
          <div className="flex flex-col gap-2">
            {mine.map((c) => {
              const chip = complianceChip(c.enrollment?.complianceStatus ?? "ON_TRACK");
              return (
                <Link key={c.course.id} href={`/course/${c.course.id}`}>
                  <Card className="lift pressable flex items-center justify-between gap-3 p-3 hover:bg-surface-2">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.course.title}</span>
                      <span className="text-xs text-muted">{c.doneLessons}/{c.totalLessons} lessons</span>
                    </div>
                    <Chip variant={chip.variant}>{chip.label}</Chip>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
        {myPaths.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            <h3 className="eyebrow text-muted">My paths</h3>
            {myPaths.map((p) => (
              <Link key={p.id} href={`/path/${p.id}`}>
                <Card className="lift pressable flex items-center justify-between p-3 hover:bg-surface-2">
                  <span className="text-sm font-medium">{p.title}</span>
                  <Chip variant="neutral">{p.completeInOrder ? "In order" : "Any order"}</Chip>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-label="Browse">
        <h2 className="eyebrow mb-2 text-muted">Browse</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CourseCard({ course }: { course: typeof t.courses.$inferSelect }) {
  return (
    <Link href={`/course/${course.id}`}>
      <Card className="lift pressable h-full p-4 hover:bg-surface-2">
        <h3 className="display mb-1 text-base">{course.title}</h3>
        <p className="mb-2 line-clamp-2 text-sm text-muted">{course.description}</p>
        <div className="flex flex-wrap gap-2">
          <Chip variant="neutral">~{course.estMinutes} min</Chip>
          {course.tags.slice(0, 2).map((tag) => (
            <Chip key={tag} variant="neutral">{tag}</Chip>
          ))}
        </div>
      </Card>
    </Link>
  );
}
