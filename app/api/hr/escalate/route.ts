import { currentUser } from "@/lib/auth/guard";
import { createTicketFromConversation, previewTicketFromConversation } from "@/lib/hr/tickets";

/**
 * Escalation (spec FR-8.7/8.7a): creates an HR ticket carrying the transcript.
 * Real identity by design — the client shows a consent note before calling.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as { conversationId: string; subject?: string; previewVersion?: string };
  const created = await createTicketFromConversation(user, body.conversationId, body.previewVersion, body.subject);
  if (!created) return new Response("Not found", { status: 404 });
  if ("previewChanged" in created) return Response.json({ code: "preview_changed" }, { status: 409 });
  return Response.json({ ok: true, ticketId: created.ticketId });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) return new Response("Bad request", { status: 400 });
  const preview = await previewTicketFromConversation(user, conversationId);
  if (!preview) return new Response("Not found", { status: 404 });
  return Response.json({ name: user.name, subject: preview.subject, body: preview.body, version: preview.version });
}
