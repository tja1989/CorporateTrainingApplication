import { currentUser } from "@/lib/auth/guard";
import { createTicketFromConversation } from "@/lib/hr/tickets";

/**
 * Escalation (spec FR-8.7/8.7a): creates an HR ticket carrying the transcript.
 * Real identity by design — the client shows a consent note before calling.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as { conversationId: string; subject?: string };
  const created = await createTicketFromConversation(user, body.conversationId, body.subject);
  if (!created) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true, ticketId: created.ticketId });
}
