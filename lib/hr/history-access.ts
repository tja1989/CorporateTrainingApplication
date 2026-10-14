import type { SessionData } from "@/lib/auth/session";

export const HR_HISTORY_TTL_MS = 5 * 60_000;
export function hrHistoryExpiresAt(session: SessionData): number | null {
  return session.shared ? Math.min((session.hrHistoryVerifiedAt ?? 0) + HR_HISTORY_TTL_MS, (session.exp ?? 0) * 1000) : null;
}
export function canReadHrHistory(session: SessionData, now = Date.now()): boolean {
  if (!session.shared) return true;
  return typeof session.hrHistoryVerifiedAt === "number" && session.hrHistoryVerifiedAt <= now && (hrHistoryExpiresAt(session) ?? 0) > now;
}
/** The grant is minted only at server creation, never from an arbitrary requested ID. */
export function canUseHrConversation(session: SessionData, conversationId: string | null | undefined): boolean {
  return canReadHrHistory(session) || (!!conversationId && session.activeHrConversationId === conversationId && (session.exp ?? 0) * 1000 > Date.now());
}
export function hrReauthenticationRequired() {
  return Response.json({ code: "hr_reauthentication_required", error: "Verify your password to open stored HR history on this shared device." }, { status: 403 });
}
