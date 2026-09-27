import { desc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Card, Chip, PageTitle, EmptyState, Button, Field, Input, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

/** HR ticket queue — visible to ADMIN/HR only, never line managers (spec FR-8.7a). */
export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string }> }) {
  const { q = "", state = "" } = await searchParams;
  await requireRole("ADMIN");
  const allTickets = await db.select().from(t.hrTickets).orderBy(desc(t.hrTickets.createdAt));
  const tickets = allTickets.filter(t => (!state || t.state === state) && (!q || t.subject.toLowerCase().includes(q.toLowerCase()))).sort((a,b) => Number(a.state === "RESOLVED") - Number(b.state === "RESOLVED"));
  const userIds = [...new Set(tickets.map((ticket) => ticket.userId))];
  const users = userIds.length ? await db.select().from(t.users).where(inArray(t.users.id, userIds)) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Escalations from the HR assistant. Employees consented to sharing their transcript.">HR tickets</PageTitle>
      <form action="/admin/tickets" method="get" className="mb-4 grid items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"><Field label="Search tickets"><Input name="q" defaultValue={q} placeholder="Ticket subject" /></Field><Field label="Ticket status"><Select name="state" defaultValue={state}><option value="">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></Select></Field><Button type="submit" className="mb-4">Apply filters</Button></form><p className="mb-3 text-sm text-muted">{tickets.length} tickets · unresolved requests first</p>
      {tickets.length === 0 ? (
        <EmptyState icon="mail" title="No tickets" body="Escalations from the assistant appear here." />
      ) : (
        <div className="flex max-w-3xl flex-col gap-2">
          {tickets.map((ticket) => {
            const age = Math.floor((Date.now() - ticket.createdAt.getTime()) / 3600_000);
            return (
              <a key={ticket.id} href={`/admin/tickets/${ticket.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-link">{ticket.subject}</p>
                    <p className="text-xs text-muted">{nameOf.get(ticket.userId) ?? "Employee"} · {age < 24 ? `${age}h` : `${Math.floor(age / 24)}d`} old</p>
                  </div>
                  <Chip variant={ticket.state === "RESOLVED" ? "success" : ticket.state === "IN_PROGRESS" ? "warning" : "destructive"}>
                    {ticket.state.toLowerCase().replace("_", " ")}
                  </Chip>
                </Card>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
