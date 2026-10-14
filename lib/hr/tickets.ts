import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";

/**
 * Escalation (spec FR-8.7/8.7a): creates an HR ticket carrying the conversation
 * transcript, under the employee's real identity. Callers show a consent step
 * first; the model never creates a ticket on its own (voice mode included).
 */
export async function previewTicketFromConversation(
  user: { id: string },
  conversationId: string,
  subject?: string,
): Promise<{ conversationId: string; subject: string; body: string; version: string } | null> {
  const [conv] = await db.select().from(t.hrConversations).where(eq(t.hrConversations.id, conversationId)).limit(1);
  if (!conv || conv.userId !== user.id) return null;

  const messages = await db
    .select()
    .from(t.hrMessages)
    .where(eq(t.hrMessages.conversationId, conv.id))
    .orderBy(asc(t.hrMessages.createdAt), asc(t.hrMessages.id));
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const finalSubject = (subject?.trim() || lastUser?.content || "HR question").slice(0, 120);

  const transcript = messages.map((m) => `${m.role === "user" ? "Employee" : "Assistant"}: ${m.content}`).join("\n\n");
  const preview = {
    conversationId: conv.id,
    subject: finalSubject,
    body: `Escalated from the HR assistant${conv.mode === "voice" ? " (voice conversation)" : ""}. Transcript:\n\n${transcript}`.slice(0, 8000),
  };
  // Include the full source, even when the displayed ticket body is truncated.
  // A later turn must require review rather than being silently added at confirm.
  const version = createHash("sha256")
    .update(JSON.stringify({
      userId: user.id,
      ...preview,
      messages: messages.map(({ id, role, content }) => ({ id, role, content })),
    }))
    .digest("hex");
  return { ...preview, version };
}

export async function createTicketFromConversation(
  user: { id: string },
  conversationId: string,
  previewVersion?: string,
  subject?: string,
): Promise<{ ticketId: string } | { previewChanged: true } | null> {
  const preview = await previewTicketFromConversation(user, conversationId, subject);
  if (!preview) return null;
  if (!previewVersion || preview.version !== previewVersion) return { previewChanged: true };

  // Insert the checked snapshot, never reread the conversation after approval.
  // Turns arriving after this check therefore cannot enter the approved body.
  const ticketId = id();
  await db.transaction(async tx => {
    await tx.insert(t.hrTickets).values({
      id: ticketId,
      conversationId: preview.conversationId,
      userId: user.id,
      subject: preview.subject,
      state: "OPEN",
    });
    await tx.insert(t.hrTicketMessages).values({ id: id(), ticketId, authorId: user.id, body: preview.body });
    await tx.insert(t.consents).values({ id: id(), userId: user.id, kind: "escalation", version: ticketId });
  });
  return { ticketId };
}
