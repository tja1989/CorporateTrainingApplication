import { canUseHrConversation, hrHistoryExpiresAt } from "@/lib/hr/history-access";
import { HrHistoryBoundary, HrHistoryUnlock } from "@/components/hr-history-boundary";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { Card, Chip, PageTitle, ButtonLink, cx } from "@/components/ui";
import { TicketReply } from "./reply-form";

export const dynamic = "force-dynamic";

/** Learner's ticket thread (spec FR-8.7, §11.8b). */
export default async function TicketPage({ params, searchParams }: { params: Promise<{ ticketId: string }>; searchParams: Promise<{ sent?: string }> }) {
  const user = await requireUser();
  const { ticketId } = await params;
  const { sent } = await searchParams;
  const [access] = await db.select({ userId: t.hrTickets.userId, conversationId: t.hrTickets.conversationId }).from(t.hrTickets).where(eq(t.hrTickets.id, ticketId)).limit(1);
  if (!access || access.userId !== user.id) notFound();
  if (user.passwordState !== "ACTIVE" || !canUseHrConversation(user.session, access.conversationId)) return <div><PageTitle>HR ticket</PageTitle><HrHistoryUnlock /></div>;
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
    <HrHistoryBoundary userId={user.id} loginId={user.session.loginId!} conversationId={ticket.conversationId} expiresAt={user.session.activeHrConversationId === ticket.conversationId ? (user.session.exp ?? 0) * 1000 : hrHistoryExpiresAt(user.session)}><div className="animate-slide-up mx-auto max-w-2xl">
      <div className="mb-3"><ButtonLink variant="ghost" href="/ask-hr">Back to HR Help</ButtonLink></div>
      <PageTitle sub={`Ticket · ${ticket.state.toLowerCase().replace("_", " ")}`}>{ticket.subject}</PageTitle>
      {sent === "1" ? <p role="status" className="mb-4 text-sm text-success-fg">Your reply was sent to HR.</p> : null}
      <div className="mb-4 flex flex-col gap-2">
        {messages.map((m) => (
          <Card key={m.id} className={cx("p-3 text-sm", m.authorId !== user.id && "bg-ai-tint")}>
            <p className="mb-1 text-xs font-medium text-muted">{m.authorId === user.id ? "You" : (nameOf.get(m.authorId) ?? "HR team")}</p>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          </Card>
        ))}
      </div>
      {ticket.state !== "RESOLVED" ? (
        <TicketReply ticketId={ticket.id} />
      ) : (
        <Chip variant="success">Resolved — thanks for reaching out.</Chip>
      )}
    </div></HrHistoryBoundary>
  );
}
