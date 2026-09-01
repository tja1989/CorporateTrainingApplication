import { asc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { hrAnswer } from "@/lib/hr/assistant";

export const maxDuration = 60;

/** HR assistant chat (spec FR-8): SSE stream; persists the conversation under the real user id (FR-8.7a). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as { message: string; conversationId?: string };
  if (!body.message?.trim() || body.message.length > 2000) return new Response("Bad request", { status: 400 });

  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const [conv] = await db.select().from(t.hrConversations).where(eq(t.hrConversations.id, conversationId)).limit(1);
    if (!conv || conv.userId !== user.id) conversationId = null;
  }
  if (!conversationId) {
    conversationId = id();
    await db.insert(t.hrConversations).values({ id: conversationId, userId: user.id, language: user.preferredLanguage });
  }
  await db.insert(t.hrMessages).values({ id: id(), conversationId, role: "user", content: body.message.trim() });

  const country = await userCountry(user.storeId);
  const audience = user.role === "LEARNER" ? ("all" as const) : ("managers" as const);

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

async function userCountry(storeId: string | null): Promise<string> {
  if (!storeId) return "AE";
  let cursor: string | null = storeId;
  for (let i = 0; i < 5 && cursor; i++) {
    const [unit] = await db.select().from(t.orgUnits).where(eq(t.orgUnits.id, cursor)).limit(1);
    if (!unit) break;
    if (unit.type === "country") return unit.name === "United Arab Emirates" ? "AE" : unit.name;
    cursor = unit.parentId;
  }
  return "AE";
}

/** GET: the user's conversations + messages for the history list. */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const conversations = await db
    .select()
    .from(t.hrConversations)
    .where(eq(t.hrConversations.userId, user.id))
    .orderBy(asc(t.hrConversations.startedAt));
  const latest = conversations[conversations.length - 1];
  const messages = latest
    ? await db.select().from(t.hrMessages).where(eq(t.hrMessages.conversationId, latest.id)).orderBy(asc(t.hrMessages.createdAt))
    : [];
  return Response.json({
    conversationId: latest?.id ?? null,
    messages: messages.map((m) => ({ role: m.role, content: m.content, citations: m.citations ?? [] })),
  });
}
