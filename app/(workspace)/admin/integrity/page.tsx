import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Card, Chip, PageTitle, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Integrity review queue (spec FR-7.3, §11.16): flags gate review, never verdicts. */
export default async function IntegrityPage() {
  await requireRole("ADMIN");
  const attempts = await db
    .select()
    .from(t.attempts)
    .where(eq(t.attempts.integrityMode, true))
    .orderBy(desc(t.attempts.startedAt))
    .limit(50);
  const attemptIds = attempts.map((a) => a.id);
  const events = attemptIds.length
    ? await db.select().from(t.integrityEvents).where(inArray(t.integrityEvents.attemptId, attemptIds))
    : [];
  const userIds = [...new Set(attempts.map((a) => a.userId))];
  const users = userIds.length ? await db.select().from(t.users).where(inArray(t.users.id, userIds)) : [];
  const nameOf = new Map(users.map((u) => [u.id, u]));
  const quizzes = await db.select().from(t.quizzes);
  const quizOf = new Map(quizzes.map((q) => [q.id, q]));

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Monitored attempts with their event flags. A person decides — never the flags alone.">Integrity review</PageTitle>
      {attempts.length === 0 ? (
        <EmptyState icon="◉" title="No monitored attempts yet" />
      ) : (
        <div className="flex max-w-3xl flex-col gap-2">
          {attempts.map((a) => {
            const evs = events.filter((e) => e.attemptId === a.id);
            const red = evs.filter((e) => e.severity === "red").length;
            const orange = evs.filter((e) => e.severity === "orange").length;
            const user = nameOf.get(a.userId);
            return (
              <Link key={a.id} href={`/admin/integrity/${a.id}`}>
                <Card className="pressable flex items-center justify-between gap-3 p-3 text-sm hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{quizOf.get(a.quizId)?.title ?? "Quiz"} — {user?.name ?? "—"}</p>
                    <p className="text-xs text-muted">
                      {a.startedAt.toISOString().slice(0, 16).replace("T", " ")} · {a.state}
                      {a.maxScore ? ` · ${Math.round(((a.score ?? 0) / a.maxScore) * 100)}%` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {red > 0 ? <Chip variant="destructive">{red} red</Chip> : null}
                    {orange > 0 ? <Chip variant="warning">{orange} orange</Chip> : null}
                    {red === 0 && orange === 0 ? <Chip variant="success">clean</Chip> : null}
                    {a.state === "CLEARED" ? <Chip variant="success">cleared</Chip> : null}
                    {a.state === "VOIDED" ? <Chip variant="neutral">voided</Chip> : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
