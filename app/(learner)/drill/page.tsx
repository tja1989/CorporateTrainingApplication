import { and, eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { isoWeekStart } from "@/lib/time";
import { EmptyState, ButtonLink } from "@/components/ui";
import { DrillSession } from "./session";

export const dynamic = "force-dynamic";

export default async function DrillPage() {
  const user = await requireUser();
  const [completedLessons] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.lessonProgress)
    .where(and(eq(t.lessonProgress.userId, user.id), eq(t.lessonProgress.status, "COMPLETED")));
  if ((completedLessons?.n ?? 0) === 0) {
    return (
      <EmptyState
        icon="target"
        title="Drill unlocks after your first lesson"
        body="Finish any lesson and the daily drill will start serving you quick practice questions. Optional, never graded."
        action={<ButtonLink variant="secondary" href="/learn">Go to my courses</ButtonLink>}
      />
    );
  }
  const week = isoWeekStart();
  const [streak] = await db
    .select()
    .from(t.streakState)
    .where(and(eq(t.streakState.userId, user.id), eq(t.streakState.weekStart, week)));
  return <DrillSession daysThisWeek={streak?.daysActive.length ?? 0} streakWeeks={streak?.currentStreakWeeks ?? 0} />;
}
