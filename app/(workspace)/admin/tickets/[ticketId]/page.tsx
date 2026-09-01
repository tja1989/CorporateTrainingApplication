import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Button, Card, Chip, PageTitle, Textarea, cx } from "@/components/ui";
import { adminReplyAction, resolveTicketAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  await requireRole("ADMIN");
  const { ticketId } = await params;
  const [ticket] = await db.select().from(t.hrTickets).where(eq(t.hrTickets.id, ticketId)).limit(1);
  if (!ticket) notFound();
  const [requester] = await db.select().from(t.users).where(eq(t.users.id, ticket.userId)).limit(1);
  const messages = await db
    .select()
    .from(t.hrTicketMessages)
    .where(eq(t.hrTicketMessages.ticketId, ticket.id))
    .orderBy(asc(t.hrTicketMessages.createdAt));
  const authorIds = [...new Set(messages.map((m) => m.authorId))];
  const authors = authorIds.length ? await db.select().from(t.users).where(inArray(t.users.id, authorIds)) : [];
  const nameOf = new Map(authors.map((a) => [a.id, a.name]));

  return (
    <div className="animate-slide-up mx-auto max-w-2xl">
      <PageTitle sub={`${requester?.name ?? "Employee"} · ${requester?.jobTitle ?? ""} · ${requester?.employeeId ?? ""}`}>
        {ticket.subject}
      </PageTitle>
      <div className="mb-4 flex flex-col gap-2">
        {messages.map((m) => (
          <Card key={m.id} className={cx("p-3 text-sm", m.authorId !== ticket.userId && "bg-ai-tint")}>
            <p className="mb-1 text-xs font-medium text-muted">{nameOf.get(m.authorId) ?? "—"}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </Card>
        ))}
      </div>
      {ticket.state !== "RESOLVED" ? (
        <div className="flex flex-col gap-2">
          <form action={adminReplyAction.bind(null, ticket.id)}>
            <Textarea name="body" rows={3} required placeholder="Reply to the employee…" className="mb-2" />
            <div className="flex gap-2">
              <Button type="submit">Reply</Button>
            </div>
          </form>
          <form action={resolveTicketAction.bind(null, ticket.id)}>
            <Button type="submit" variant="secondary">Mark resolved</Button>
          </form>
        </div>
      ) : (
        <Chip variant="success">Resolved</Chip>
      )}
    </div>
  );
}
