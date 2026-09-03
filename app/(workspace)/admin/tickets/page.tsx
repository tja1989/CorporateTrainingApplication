import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Card, Chip, PageTitle, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** HR ticket queue — visible to ADMIN/HR only, never line managers (spec FR-8.7a). */
export default async function TicketsPage() {
  await requireRole("ADMIN");
  const tickets = await db.select().from(t.hrTickets).orderBy(desc(t.hrTickets.createdAt)).limit(50);
  const userIds = [...new Set(tickets.map((ticket) => ticket.userId))];
  const users = userIds.length ? await db.select().from(t.users).where(inArray(t.users.id, userIds)) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Escalations from the HR assistant. Employees consented to sharing their transcript.">HR tickets</PageTitle>
      {tickets.length === 0 ? (
        <EmptyState icon="mail" title="No tickets" body="Escalations from the assistant appear here." />
      ) : (
        <div className="flex max-w-3xl flex-col gap-2">
          {tickets.map((ticket) => {
            const age = Math.floor((Date.now() - ticket.createdAt.getTime()) / 3600_000);
            return (
              <Link key={ticket.id} href={`/admin/tickets/${ticket.id}`}>
                <Card className="lift pressable flex items-center justify-between gap-3 p-3 text-sm hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted">{nameOf.get(ticket.userId) ?? "Employee"} · {age < 24 ? `${age}h` : `${Math.floor(age / 24)}d`} old</p>
                  </div>
                  <Chip variant={ticket.state === "RESOLVED" ? "success" : ticket.state === "IN_PROGRESS" ? "warning" : "destructive"}>
                    {ticket.state.toLowerCase().replace("_", " ")}
                  </Chip>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
