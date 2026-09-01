import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { Card, Chip, PageTitle, Button, Textarea, cx } from "@/components/ui";
import { replyToTicketAction } from "./actions";

export const dynamic = "force-dynamic";

/** Learner's ticket thread (spec FR-8.7, §11.8b). */
export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const user = await requireUser();
  const { ticketId } = await params;
  const [ticket] = await db.select().from(t.hrTickets).where(eq(t.hrTickets.id, ticketId)).limit(1);
  if (!ticket || ticket.userId !== user.id) notFound();
  const messages = await db
    .select()
    .from(t.hrTicketMessages)
    .where(eq(t.hrTicketMessages.ticketId, ticket.id))
    .orderBy(asc(t.hrTicketMessages.createdAt));
  const authorIds = [...new Set(messages.map((m) => m.authorId))];
  const authors = authorIds.length ? await db.select().from(t.users).where(inArray(t.users.id, authorIds)) : [];
  const nameOf = new Map(authors.map((a) => [a.id, a.role === "ADMIN" ? "HR team" : a.name]));

  return (
    <div className="animate-slide-up mx-auto max-w-2xl">
      <PageTitle sub={`Ticket · ${ticket.state.toLowerCase().replace("_", " ")}`}>{ticket.subject}</PageTitle>
      <div className="mb-4 flex flex-col gap-2">
        {messages.map((m) => (
          <Card key={m.id} className={cx("p-3 text-sm", m.authorId !== user.id && "bg-ai-tint")}>
            <p className="mb-1 text-xs font-medium text-muted">{m.authorId === user.id ? "You" : (nameOf.get(m.authorId) ?? "HR team")}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </Card>
        ))}
      </div>
      {ticket.state !== "RESOLVED" ? (
        <form action={replyToTicketAction.bind(null, ticket.id)}>
          <Textarea name="body" rows={3} required placeholder="Add more details…" className="mb-2" />
          <Button type="submit">Send</Button>
        </form>
      ) : (
        <Chip variant="success">Resolved — thanks for reaching out.</Chip>
      )}
    </div>
  );
}
