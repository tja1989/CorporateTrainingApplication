import { desc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { pseudoId } from "@/lib/hr/assistant";

/** Thumbs feedback on the latest assistant message (KPI: CSAT, spec FR-8.12). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as { conversationId: string; feedback: "up" | "down" };
  const [conv] = await db.select().from(t.hrConversations).where(eq(t.hrConversations.id, body.conversationId)).limit(1);
  if (!conv || conv.userId !== user.id) return new Response("Not found", { status: 404 });
  const [last] = await db
    .select()
    .from(t.hrMessages)
    .where(eq(t.hrMessages.conversationId, conv.id))
    .orderBy(desc(t.hrMessages.createdAt))
    .limit(1);
  if (last?.role === "assistant") {
    await db.update(t.hrMessages).set({ feedback: body.feedback }).where(eq(t.hrMessages.id, last.id));
    const [audit] = await db
      .select()
      .from(t.hrAuditLog)
      .where(eq(t.hrAuditLog.pseudoId, pseudoId(user.id)))
      .orderBy(desc(t.hrAuditLog.ts))
      .limit(1);
    if (audit) await db.update(t.hrAuditLog).set({ feedback: body.feedback }).where(eq(t.hrAuditLog.id, audit.id));
  }
  return Response.json({ ok: true });
}
