import { asc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";

/**
 * Escalation (spec FR-8.7/8.7a): creates an HR ticket carrying the conversation
 * transcript, under the employee's real identity. Callers show a consent step
 * first; the model never creates a ticket on its own (voice mode included).
 */
export async function createTicketFromConversation(
  user: { id: string },
  conversationId: string,
  subject?: string,
): Promise<{ ticketId: string } | null> {
  const [conv] = await db.select().from(t.hrConversations).where(eq(t.hrConversations.id, conversationId)).limit(1);
  if (!conv || conv.userId !== user.id) return null;

  const messages = await db
    .select()
    .from(t.hrMessages)
    .where(eq(t.hrMessages.conversationId, conv.id))
    .orderBy(asc(t.hrMessages.createdAt));
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const finalSubject = (subject?.trim() || lastUser?.content || "HR question").slice(0, 120);

  const ticketId = id();
  await db.insert(t.hrTickets).values({ id: ticketId, conversationId: conv.id, userId: user.id, subject: finalSubject, state: "OPEN" });
  const transcript = messages.map((m) => `${m.role === "user" ? "Employee" : "Assistant"}: ${m.content}`).join("\n\n");
  await db.insert(t.hrTicketMessages).values({
    id: id(),
    ticketId,
    authorId: user.id,
    body: `Escalated from the HR assistant${conv.mode === "voice" ? " (voice conversation)" : ""}. Transcript:\n\n${transcript}`.slice(0, 8000),
  });
  await db.insert(t.consents).values({ id: id(), userId: user.id, kind: "escalation", version: ticketId });
  return { ticketId };
}
