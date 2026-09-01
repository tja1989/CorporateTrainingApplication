import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { myCourses, recommend } from "@/lib/lms/queries";
import { isoWeekStart } from "@/lib/time";
import { Card, Chip, ProgressRing, complianceChip, ButtonLink, EmptyState, DemoBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const mine = await myCourses(user.id);
  const inProgress = mine.filter((c) => c.enrollment?.status === "IN_PROGRESS");
  const resume = inProgress[0] ?? mine.find((c) => c.enrollment?.status === "NOT_STARTED");
  const dueSoon = mine.filter((c) => ["DUE_SOON", "OVERDUE"].includes(c.enrollment?.complianceStatus ?? ""));
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

  return (
    <div className="animate-slide-up">
      <DemoBanner />
      <h1 className="font-ai-voice mb-6 text-2xl font-semibold">
        {new Date().getHours() < 12 ? "Good morning" : "Welcome back"}, {firstName}
      </h1>

      {mine.length === 0 ? (
        <EmptyState
          icon="▤"
          title="No training assigned yet"
          body="When your manager or an enrollment rule assigns you a course, it will appear here."
          action={<ButtonLink variant="secondary" href="/learn">Browse the catalog</ButtonLink>}
        />
      ) : null}

      {resume ? (
        <Link href={`/course/${resume.course.id}`} className="block">
          <Card className="pressable mb-6 flex items-center gap-4 p-4 hover:bg-surface-2">
            <ProgressRing pct={resume.pct} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Continue learning</p>
              <h2 className="truncate font-medium">{resume.course.title}</h2>
              <p className="text-sm text-muted">
                {resume.doneLessons}/{resume.totalLessons} lessons · ~
                {Math.max(1, Math.round(((100 - resume.pct) / 100) * resume.course.estMinutes))} min left
              </p>
            </div>
            <span aria-hidden className="text-muted">→</span>
          </Card>
        </Link>
      ) : null}

      {open.length === 0 && mine.length > 0 ? (
        <EmptyState
          icon="✓"
          title="You're all caught up"
          body="Every assigned course is complete. Explore the catalog to keep learning."
          action={<ButtonLink variant="secondary" href="/learn">Browse courses</ButtonLink>}
        />
      ) : null}

      {dueSoon.length > 0 ? (
        <section className="mb-6" aria-label="Due soon">
          <h2 className="mb-2 text-sm font-semibold text-muted">Due soon</h2>
          <div className="flex flex-col gap-2">
            {dueSoon.map((c) => {
              const chip = complianceChip(c.enrollment?.complianceStatus ?? "ON_TRACK");
              return (
                <Link key={c.course.id} href={`/course/${c.course.id}`}>
                  <Card className="pressable flex items-center justify-between gap-3 p-3 hover:bg-surface-2">
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
          </div>
        </section>
      ) : null}

      <section className="mb-6" aria-label="Daily drill">
        <Link href={drillUnlocked ? "/drill" : "#"} aria-disabled={!drillUnlocked} className={drillUnlocked ? "" : "pointer-events-none"}>
          <Card className={`pressable flex items-center gap-4 p-4 ${drillUnlocked ? "hover:bg-surface-2" : "opacity-60"}`}>
            <span className="text-2xl" aria-hidden>◎</span>
            <div className="flex-1">
              <h2 className="font-medium">Today’s 3-minute drill</h2>
              <p className="text-sm text-muted">
                {drillUnlocked
                  ? drillDue > 0
                    ? `${drillDue} question${drillDue === 1 ? "" : "s"} ready — quick practice keeps it fresh`
                    : "Warm up with a quick practice round"
                  : "Unlocks after your first completed lesson"}
              </p>
            </div>
            <Chip variant="neutral">{daysThisWeek}/3 days this week</Chip>
          </Card>
        </Link>
      </section>

      {recs.length > 0 ? (
        <section aria-label="Recommended">
          <h2 className="mb-2 text-sm font-semibold text-muted">Recommended</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recs.map((r) => (
              <Link key={r.course.id} href={`/course/${r.course.id}`}>
                <Card className="pressable h-full p-4 hover:bg-surface-2">
                  <h3 className="mb-1 font-medium">{r.course.title}</h3>
                  <p className="mb-2 line-clamp-2 text-sm text-muted">{r.course.description}</p>
                  <p className="text-xs text-muted">Because: {r.reason}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
