import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { myCourses, recommend } from "@/lib/lms/queries";
import { isoWeekStart } from "@/lib/time";
import { Card, Chip, Tile, Stagger, SectionTitle, PageHeader, complianceChip, ButtonLink, EmptyState, DemoBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const mine = await myCourses(user.id);
  const inProgress = mine.filter((c) => c.enrollment?.status === "IN_PROGRESS");
  const resume = inProgress[0] ?? mine.find((c) => c.enrollment?.status === "NOT_STARTED");
  const dueSoon = mine.filter((c) => ["DUE_SOON", "OVERDUE"].includes(c.enrollment?.complianceStatus ?? ""));
  const overdue = dueSoon.filter((c) => c.enrollment?.complianceStatus === "OVERDUE").length;
  const recs = recommend(mine).filter((r) => r.course.id !== resume?.course.id);
  const open = mine.filter((c) => c.enrollment?.status !== "COMPLETED");

  const anyCompletedLesson = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.lessonProgress)
    .where(and(eq(t.lessonProgress.userId, user.id), eq(t.lessonProgress.status, "COMPLETED")));
  const drillUnlocked = (anyCompletedLesson[0]?.n ?? 0) > 0;

  const week = isoWeekStart();
  const [streak] = await db
    .select()
    .from(t.streakState)
    .where(and(eq(t.streakState.userId, user.id), eq(t.streakState.weekStart, week)));
  const daysThisWeek = streak?.daysActive.length ?? 0;

  const dueToday = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.drillState)
    .where(and(eq(t.drillState.userId, user.id), gte(sql`now()`, t.drillState.dueAt)));
  const drillDue = dueToday[0]?.n ?? 0;

  const firstName = user.name.split(" ")[0];
  const greeting = new Date().getHours() < 12 ? "Good morning" : "Welcome back";
  const minutesLeft = resume ? Math.max(1, Math.round(((100 - resume.pct) / 100) * resume.course.estMinutes)) : 0;

  return (
    <div className="animate-slide-up">
      <DemoBanner />
      <PageHeader
        title={`${greeting}, ${firstName}`}
        sub={mine.length > 0 ? `${open.length} open course${open.length === 1 ? "" : "s"} · ${dueSoon.length} due soon` : undefined}
      />

      {mine.length === 0 ? (
        <EmptyState
          icon="book"
          title="No training assigned yet"
          body="When your manager or an enrollment rule assigns you a course, it will appear here."
          action={<ButtonLink variant="secondary" href="/learn">Browse the catalog</ButtonLink>}
        />
      ) : (
        /* At-a-glance band — each tile answers one question and links to the answer (spec §10.7 v1.2) */
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr]" aria-label="At a glance">
          {resume ? (
            <Tile
              className="col-span-2 sm:col-span-1"
              label="Continue learning"
              value={resume.course.title}
              hint={`${resume.doneLessons}/${resume.totalLessons} lessons · ~${minutesLeft} min left`}
              ring={resume.pct}
              href={`/course/${resume.course.id}`}
            />
          ) : (
            <Tile className="col-span-2 sm:col-span-1" label="Continue learning" value="All caught up" hint="Every assigned course is complete" tone="success" href="/learn" />
          )}
          <Tile
            label={dueSoon.length === 1 ? "course due soon" : "courses due soon"}
            value={dueSoon.length}
            hint={overdue > 0 ? `${overdue} overdue` : dueSoon.length > 0 ? "Finish these first" : "Nothing at risk"}
            tone={overdue > 0 ? "destructive" : dueSoon.length > 0 ? "warning" : "success"}
            href="/learn"
          />
          <Tile
            label="drill days this week"
            value={`${daysThisWeek}/3`}
            hint={drillUnlocked ? (drillDue > 0 ? `${drillDue} question${drillDue === 1 ? "" : "s"} ready` : "Warm-up available") : "Unlocks after your first lesson"}
            href="/drill"
            disabled={!drillUnlocked}
          />
        </div>
      )}

      {dueSoon.length > 0 ? (
        <section className="mb-6" aria-label="Due soon">
          <SectionTitle>Due soon</SectionTitle>
          <Stagger className="flex flex-col gap-2">
            {dueSoon.map((c) => {
              const chip = complianceChip(c.enrollment?.complianceStatus ?? "ON_TRACK");
              return (
                <Link key={c.course.id} href={`/course/${c.course.id}`} className="block">
                  <Card className="lift pressable flex items-center justify-between gap-3 p-3 hover:bg-surface-2">
                    <span className="truncate text-sm font-medium">{c.course.title}</span>
                    <span className="flex items-center gap-2">
                      {c.enrollment?.dueAt ? (
                        <span className="text-xs text-muted">due {c.enrollment.dueAt.toISOString().slice(0, 10)}</span>
                      ) : null}
                      <Chip variant={chip.variant}>{chip.label}</Chip>
                    </span>
                  </Card>
                </Link>
              );
            })}
          </Stagger>
        </section>
      ) : null}

      {recs.length > 0 ? (
        <section aria-label="Recommended">
          <SectionTitle>Recommended</SectionTitle>
          <Stagger className="grid gap-3 sm:grid-cols-2">
            {recs.map((r) => (
              <Link key={r.course.id} href={`/course/${r.course.id}`} className="block h-full">
                <Card className="lift pressable h-full p-4 hover:bg-surface-2">
                  <h3 className="display mb-1 text-base">{r.course.title}</h3>
                  <p className="mb-2 line-clamp-2 text-sm text-muted">{r.course.description}</p>
                  <p className="text-xs text-muted">Because: {r.reason}</p>
                </Card>
              </Link>
            ))}
          </Stagger>
        </section>
      ) : null}
    </div>
  );
}
