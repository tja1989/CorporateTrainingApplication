import { and, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import bcrypt from "bcryptjs";
import { apiUser } from "@/lib/auth/guard";
import { updateHrSession } from "@/lib/auth/session";
import { throttled, recordAttempt } from "@/lib/auth/rate-limit";
import { canReadHrHistory, canUseHrConversation, hrHistoryExpiresAt, hrReauthenticationRequired } from "@/lib/hr/history-access";

export async function GET(req: Request) {
  const user = await apiUser();
  if (!user || user.passwordState !== "ACTIVE") return new Response("Unauthorized", { status: 401 });
  const query = new URL(req.url).searchParams;
  const conversationId = query.get("conversationId");
  if (conversationId) {
    const [owned] = await db.select({ id: t.hrConversations.id }).from(t.hrConversations)
      .where(and(eq(t.hrConversations.id, conversationId), eq(t.hrConversations.userId, user.id))).limit(1);
    if (!owned) return new Response("Not found", { status: 404 });
    if (!canUseHrConversation(user.session, conversationId)) return hrReauthenticationRequired();
  } else if (query.get("scope") !== "session" && !canReadHrHistory(user.session)) return hrReauthenticationRequired();
  // Session-only status never returns stored history or grants history access.
  return Response.json({ ok: true, userId: user.id, loginId: user.session.loginId, expiresAt: hrHistoryExpiresAt(user.session) });
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user || user.passwordState !== "ACTIVE" || !user.passwordHash) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.password !== "string" || body.password.length > 1024) return new Response("Bad request", { status: 400 });
  const key = `hr-history:${user.id}`;
  if (await throttled(key)) return Response.json({ error: "Too many attempts. Try again in 15 minutes or ask your manager for a reset code." }, { status: 429 });
  const match = await bcrypt.compare(body.password, user.passwordHash);
  await recordAttempt(key, match);
  if (!match) return Response.json({ error: "Password is incorrect. Try again or ask your manager for a reset code." }, { status: 403 });
  const hrHistoryVerifiedAt = Date.now();
  await updateHrSession(user.session, { hrHistoryVerifiedAt });
  return Response.json({ ok: true, expiresAt: hrHistoryExpiresAt({ ...user.session, hrHistoryVerifiedAt }) });
}
