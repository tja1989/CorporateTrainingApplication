import { inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole, teamOf } from "@/lib/auth/guard";
import { Card, Chip, PageTitle, complianceChip, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireRole("MANAGER", "ADMIN");
  const team = await teamOf(user.id);
  const enrollments = team.length
    ? await db.select().from(t.enrollments).where(inArray(t.enrollments.userId, team.map((u) => u.id)))
    : [];

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Your direct reports and their training status.">My team</PageTitle>
      {team.length === 0 ? (
        <EmptyState title="No direct reports" body="People assigned to you as manager will appear here." />
      ) : (
        <div className="flex max-w-3xl flex-col gap-2">
          {team.map((member) => {
            const items = enrollments.filter((e) => e.userId === member.id && e.status !== "WITHDRAWN");
            const overdue = items.filter((e) => e.complianceStatus === "OVERDUE").length;
            const dueSoon = items.filter((e) => e.complianceStatus === "DUE_SOON").length;
            return (
              <Card key={member.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-muted">{member.jobTitle ?? ""} · {items.length} enrollment(s)</p>
                </div>
                <div className="flex gap-1.5">
                  {overdue > 0 ? <Chip variant="destructive">{overdue} overdue</Chip> : null}
                  {dueSoon > 0 ? <Chip variant="warning">{dueSoon} due soon</Chip> : null}
                  {overdue === 0 && dueSoon === 0 ? <Chip variant={complianceChip("COMPLETED").variant}>On track</Chip> : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
