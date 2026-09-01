import Link from "next/link";
import { and, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole, teamOf } from "@/lib/auth/guard";
import { Card, Chip, PageHeader, EmptyState, Tile, Stagger } from "@/components/ui";

export const dynamic = "force-dynamic";

const TILES = [
  { key: "OVERDUE", label: "Overdue", tone: "destructive" as const },
  { key: "DUE_SOON", label: "Due soon", tone: "warning" as const },
  { key: "IN_PROGRESS", label: "In progress", tone: "default" as const },
  { key: "COMPLETED", label: "Completed", tone: "success" as const },
  { key: "COMPLETED_EXPIRING", label: "Expiring certs", tone: "warning" as const },
  { key: "INACTIVE", label: "Inactive 30d", tone: "muted" as const },
];

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireRole("MANAGER", "ADMIN");
  const { filter } = await searchParams;
  const team = await teamOf(user.id);
  const teamIds = team.map((u) => u.id);
  const enrollments = teamIds.length
    ? await db.select().from(t.enrollments).where(inArray(t.enrollments.userId, teamIds))
    : [];
  const recentEvents = teamIds.length
    ? await db
        .select({ userId: t.uiEvents.userId })
        .from(t.uiEvents)
        .where(and(inArray(t.uiEvents.userId, teamIds), sql`ts > now() - interval '30 days'`))
    : [];
  const activeIds = new Set(recentEvents.map((e) => e.userId));

  const counts: Record<string, number> = {};
  for (const tile of TILES) counts[tile.key] = 0;
  for (const e of enrollments) {
    if (e.status === "WITHDRAWN") continue;
    if (e.complianceStatus in counts) counts[e.complianceStatus]++;
    if (e.status === "IN_PROGRESS") counts.IN_PROGRESS++;
  }
  counts.INACTIVE = team.filter((u) => !activeIds.has(u.id)).length;

  const filtered = filter
    ? filter === "INACTIVE"
      ? team.filter((u) => !activeIds.has(u.id))
      : team.filter((u) =>
          enrollments.some(
            (e) =>
              e.userId === u.id &&
              e.status !== "WITHDRAWN" &&
              (filter === "IN_PROGRESS" ? e.status === "IN_PROGRESS" : e.complianceStatus === filter),
          ),
        )
    : team;

  return (
    <div className="animate-slide-up">
      <PageHeader title="My team" sub="Tiles filter the list. Learners without email or recent app opens need an in-person nudge." />

      {team.length === 0 ? (
        <EmptyState title="No direct reports" body="People assigned to you as manager will appear here." />
      ) : (
        <>
          {/* Status mosaic — each tile answers one question and filters the list below (spec §10.7 v1.2) */}
          <div className="mb-6 grid max-w-4xl grid-cols-3 gap-3 sm:grid-cols-6" aria-label="Team status">
            {TILES.map((tile) => (
              <Tile
                key={tile.key}
                label={tile.label}
                value={counts[tile.key]}
                tone={counts[tile.key] > 0 ? tile.tone : "muted"}
                href={filter === tile.key ? "/team" : `/team?filter=${tile.key}`}
                active={filter === tile.key}
                className="p-3"
              />
            ))}
          </div>

          <Stagger className="flex max-w-3xl flex-col gap-2">
            {filtered.map((member) => {
              const items = enrollments.filter((e) => e.userId === member.id && e.status !== "WITHDRAWN");
              const overdue = items.filter((e) => e.complianceStatus === "OVERDUE").length;
              const dueSoon = items.filter((e) => e.complianceStatus === "DUE_SOON").length;
              const unreachable = !member.email && !activeIds.has(member.id);
              return (
                <Link key={member.id} href={`/team/${member.id}`} className="block">
                  <Card className="pressable flex items-center justify-between gap-3 p-3 hover:bg-surface-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted">{member.jobTitle ?? ""} · {items.length} enrollment(s)</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {unreachable ? <Chip variant="warning">nudge in person</Chip> : null}
                      {overdue > 0 ? <Chip variant="destructive">{overdue} overdue</Chip> : null}
                      {dueSoon > 0 ? <Chip variant="warning">{dueSoon} due soon</Chip> : null}
                      {overdue === 0 && dueSoon === 0 ? <Chip variant="success">On track</Chip> : null}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </Stagger>
          {filtered.length === 0 ? <p className="text-sm text-muted">Nobody matches this tile right now.</p> : null}
        </>
      )}
    </div>
  );
}
