import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { LiveUnavailableError, liveAvailable, mintLiveToken, resolveLiveModel } from "@/lib/live/gemini";
import { assistantContextFor, buildHrLiveConfig } from "@/lib/live/hr-voice";
import { HrSessionBody, type SessionInfo } from "@/lib/live/shared";

export const maxDuration = 60;

/**
 * Starts (or resumes) a voice HR conversation (spec FR-14.3): creates the
 * conversation + consent rows and mints a one-use constrained token. Without
 * GEMINI_API_KEY the client runs the typed offline demo against the same tools.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const parsed = HrSessionBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response("Bad request", { status: 400 });

  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const [conv] = await db.select().from(t.hrConversations).where(eq(t.hrConversations.id, conversationId)).limit(1);
    if (!conv || conv.userId !== user.id) conversationId = null;
  }
  if (!conversationId) {
    conversationId = id();
    await db.insert(t.hrConversations).values({ id: conversationId, userId: user.id, language: user.preferredLanguage, mode: "voice" });
  }
  if (!parsed.data.resumeHandle) {
    await db.insert(t.consents).values({ id: id(), userId: user.id, kind: "voice", version: `hr:${conversationId}` });
  }

  if (!liveAvailable()) {
    const info: SessionInfo = { mock: true, model: "mock", conversationId };
    return Response.json(info);
  }
  try {
    const { model, warning } = await resolveLiveModel();
    const context = await assistantContextFor(user);
    const { token, expiresAt } = await mintLiveToken({ model, config: buildHrLiveConfig({ resumeHandle: parsed.data.resumeHandle, context }) });
    const info: SessionInfo = { mock: false, model, token, expiresAt, warning, conversationId };
    return Response.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Live voice is unavailable";
    // No usable Live model behind the key is a configuration state, not a
    // failure: run the typed offline demo against the same tools and say why,
    // exactly as a missing key does. Anything else (a token mint that failed,
    // a network fault) is a real error and still surfaces as one.
    if (err instanceof LiveUnavailableError) {
      const info: SessionInfo = { mock: true, model: "mock", warning: message, conversationId };
      return Response.json(info);
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
