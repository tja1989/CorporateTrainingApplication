import { asc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";

/**
 * Escalation (spec FR-8.7/8.7a): creates an HR ticket carrying the transcript.
 * Real identity by design — the client shows a consent note before calling.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as { conversationId: string; subject?: string };
  const [conv] = await db.select().from(t.hrConversations).where(eq(t.hrConversations.id, body.conversationId)).limit(1);
  if (!conv || conv.userId !== user.id) return new Response("Not found", { status: 404 });

  const messages = await db
    .select()
    .from(t.hrMessages)
    .where(eq(t.hrMessages.conversationId, conv.id))
    .orderBy(asc(t.hrMessages.createdAt));
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const subject = (body.subject ?? lastUser?.content ?? "HR question").slice(0, 120);

  const ticketId = id();
  await db.insert(t.hrTickets).values({ id: ticketId, conversationId: conv.id, userId: user.id, subject, state: "OPEN" });
  const transcript = messages.map((m) => `${m.role === "user" ? "Employee" : "Assistant"}: ${m.content}`).join("\n\n");
  await db.insert(t.hrTicketMessages).values({
    id: id(),
    ticketId,
    authorId: user.id,
    body: `Escalated from the HR assistant. Transcript:\n\n${transcript}`.slice(0, 8000),
  });
  await db.insert(t.consents).values({ id: id(), userId: user.id, kind: "escalation", version: ticketId });

  // audit: mark latest exchange escalated
  return Response.json({ ok: true, ticketId });
}
