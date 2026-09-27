import { canReadHrHistory, canUseHrConversation, hrReauthenticationRequired } from "@/lib/hr/history-access";
import { updateHrSession } from "@/lib/auth/session";
import { and, asc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { hrAnswer } from "@/lib/hr/assistant";
import { hrScopeFor } from "@/lib/hr/scope";

export const maxDuration = 60;

/** HR assistant chat (spec FR-8): SSE stream; persists the conversation under the real user id (FR-8.7a). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.passwordState !== "ACTIVE") return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as { message: string; conversationId?: string };
  if (!body.message?.trim() || body.message.length > 2000) return new Response("Bad request", { status: 400 });

  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    if (!canUseHrConversation(user.session, conversationId)) return hrReauthenticationRequired();
    const [conv] = await db.select().from(t.hrConversations).where(eq(t.hrConversations.id, conversationId)).limit(1);
    if (!conv || conv.userId !== user.id) conversationId = null;
  }
  if (!conversationId) {
    conversationId = id();
    await db.insert(t.hrConversations).values({ id: conversationId, userId: user.id, language: user.preferredLanguage });
    if (user.session.shared) await updateHrSession(user.session, { activeHrConversationId: conversationId });
  }
  await db.insert(t.hrMessages).values({ id: id(), conversationId, role: "user", content: body.message.trim() });

  const { country, audience } = await hrScopeFor(user);

  const encoder = new TextEncoder();
  const cid = conversationId;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send({ type: "conversation", conversationId: cid });
      try {
        for await (const event of hrAnswer({ userId: user.id, question: body.message.trim(), country, audience })) {
          send(event);
          if (event.type === "final") {
            await db.insert(t.hrMessages).values({
              id: id(),
              conversationId: cid,
              role: "assistant",
              content: event.answer,
              citations: event.citations,
            });
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Assistant failed" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

/** GET: the user's conversations + messages for the history list. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.passwordState !== "ACTIVE") return new Response("Unauthorized", { status: 401 });
  const requested = new URL(req.url).searchParams.get("conversationId");
  if (requested ? !canUseHrConversation(user.session, requested) : !canReadHrHistory(user.session)) return hrReauthenticationRequired();
  const conversations = await db.select().from(t.hrConversations)
    .where(requested ? and(eq(t.hrConversations.userId, user.id), eq(t.hrConversations.id, requested)) : eq(t.hrConversations.userId, user.id)).orderBy(asc(t.hrConversations.startedAt));
  const latest = requested ? conversations.find(c => c.id === requested) : conversations[conversations.length - 1];
  if (requested && !latest) return new Response("Not found", { status: 404 });
  const messages = latest
    ? await db.select().from(t.hrMessages).where(eq(t.hrMessages.conversationId, latest.id)).orderBy(asc(t.hrMessages.createdAt))
    : [];
  return Response.json({
    conversationId: latest?.id ?? null,
    messages: messages.map((m) => ({ role: m.role, content: m.content, citations: m.citations ?? [] })),
  });
}
