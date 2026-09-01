import { desc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { myCourses, totalPoints } from "@/lib/lms/queries";
import { isoWeekStart } from "@/lib/time";
import { and } from "drizzle-orm";
import { Card, Chip, PageTitle, ProgressRing, ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

const BADGE_LABELS: Record<string, string> = {
  first_course: "First course",
  five_courses: "5 courses",
  four_week_streak: "4-week streak",
  perfect_quiz: "Perfect quiz",
};

export default async function ProfilePage() {
  const user = await requireUser();
  const [mine, points, badgeRows, certRows] = await Promise.all([
    myCourses(user.id),
    totalPoints(user.id),
    db.select().from(t.badges).where(eq(t.badges.userId, user.id)),
    db.select().from(t.certificates).where(eq(t.certificates.userId, user.id)).orderBy(desc(t.certificates.issuedAt)),
  ]);
  const week = isoWeekStart();
  const [streak] = await db
    .select()
    .from(t.streakState)
    .where(and(eq(t.streakState.userId, user.id), eq(t.streakState.weekStart, week)));
  const daysThisWeek = streak?.daysActive.length ?? 0;
  const completed = mine.filter((c) => c.enrollment?.status === "COMPLETED").length;
  const active = mine.find((c) => c.enrollment?.status === "IN_PROGRESS");
  const courseById = new Map(mine.map((m) => [m.course.id, m.course]));

  return (
    <div className="animate-slide-up">
      <PageTitle sub={`${user.jobTitle ?? "Team member"} · ID ${user.employeeId}`}>{user.name}</PageTitle>

      <div className="mb-6 grid max-w-2xl gap-3 sm:grid-cols-3">
        <Card className="flex flex-col items-center gap-1 p-4">
          <ProgressRing pct={(daysThisWeek / 3) * 100} size={56} label={`${daysThisWeek} of 3 weekly goal days`} />
          <span className="text-xs text-muted">Weekly goal: {daysThisWeek}/3 days</span>
          <span className="text-xs text-muted">{streak?.currentStreakWeeks ?? 0}-week streak</span>
        </Card>
        <Card className="flex flex-col items-center justify-center gap-1 p-4">
          <span className="text-xl font-medium">{points}</span>
          <span className="text-xs text-muted">points</span>
        </Card>
        <Card className="flex flex-col items-center justify-center gap-1 p-4">
          <span className="text-xl font-medium">{completed}</span>
          <span className="text-xs text-muted">courses completed</span>
        </Card>
      </div>

      {active ? (
        <Card className="mb-6 flex max-w-2xl items-center gap-4 p-4">
          <ProgressRing pct={active.pct} size={48} />
          <div>
            <p className="text-xs text-muted">Active course</p>
            <p className="text-sm font-medium">{active.course.title}</p>
          </div>
        </Card>
      ) : null}

      <section className="mb-6 max-w-2xl" aria-label="Badges">
        <h2 className="mb-2 text-sm font-medium text-muted">Badges</h2>
        <div className="flex flex-wrap gap-2">
          {badgeRows.length === 0 ? <p className="text-sm text-muted">Complete courses and streaks to earn badges.</p> : null}
          {badgeRows.map((b) => (
            <Chip key={b.id} variant="primary">★ {BADGE_LABELS[b.badge] ?? b.badge}</Chip>
          ))}
        </div>
      </section>

      <section className="max-w-2xl" aria-label="Certificates">
        <h2 className="mb-2 text-sm font-medium text-muted">Certificates</h2>
        {certRows.length === 0 ? (
          <p className="text-sm text-muted">Certificates you earn will appear here.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {certRows.map((c) => (
              <Card key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{courseById.get(c.courseId)?.title ?? c.courseId}</p>
                  <p className="text-xs text-muted">
                    Issued {c.issuedAt.toISOString().slice(0, 10)}
                    {c.expiresAt ? ` · valid until ${c.expiresAt.toISOString().slice(0, 10)}` : ""} · {c.serial}
                  </p>
                </div>
                <ButtonLink variant="secondary" href={`/api/certificates/${c.id}`}>PDF</ButtonLink>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="mt-8 text-xs text-muted">
        Language: {user.preferredLanguage.toUpperCase()} · <a className="underline underline-offset-2" href="/privacy-notice">Privacy notice</a>
      </p>
    </div>
  );
}
