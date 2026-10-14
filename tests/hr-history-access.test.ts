import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeJwt } from "jose";
import { canReadHrHistory, canUseHrConversation, HR_HISTORY_TTL_MS } from "@/lib/hr/history-access";
import { createSession, destroySession, readSession, updateHrSession, type SessionData } from "@/lib/auth/session";
const store = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => store.has(key) ? { value: store.get(key) } : undefined, set: (key: string, value: string) => store.set(key, value), delete: (key: string) => store.delete(key) }) }));
const base: SessionData = { uid: "fixture-user", role: "LEARNER", shared: true, workspace: "learner", mfa: true };
beforeEach(() => store.clear());

describe("shared HR credential boundary", () => {
  it("requires a recent nonfuture credential claim and an unexpired session", () => {
    const now = Date.now(), session = { ...base, exp: Math.floor(now / 1000) + 900 };
    expect(canReadHrHistory(session, now)).toBe(false);
    expect(canReadHrHistory({ ...session, hrHistoryVerifiedAt: now }, now)).toBe(true);
    expect(canReadHrHistory({ ...session, hrHistoryVerifiedAt: now - HR_HISTORY_TTL_MS }, now)).toBe(false);
    expect(canReadHrHistory({ ...session, hrHistoryVerifiedAt: now + 1 }, now)).toBe(false);
    expect(canReadHrHistory({ ...session, hrHistoryVerifiedAt: now, exp: Math.floor(now / 1000) - 1 }, now)).toBe(false);
    expect(canReadHrHistory({ ...base, shared: false }, now)).toBe(true);
  });
  it("allows only the server-granted current conversation without unlocking history", () => {
    const session = { ...base, exp: Math.floor(Date.now() / 1000) + 900, activeHrConversationId: "new" };
    expect(canUseHrConversation(session, "new")).toBe(true);
    expect(canUseHrConversation(session, "old")).toBe(false);
    expect(canReadHrHistory(session)).toBe(false);
    expect(canUseHrConversation({ ...session, exp: 1 }, "new")).toBe(false);
  });
  it("updates signed HR claims without extending expiry and removes them on a fresh login or logout", async () => {
    await createSession(base);
    const original = (await readSession())!;
    await updateHrSession(original, { hrHistoryVerifiedAt: Date.now(), activeHrConversationId: "new" });
    const updated = decodeJwt(store.get("ll_session")!);
    expect(updated.loginId).toBe(original.loginId); expect(updated.loginId).toBeTruthy();
    expect(updated.exp).toBe(original.exp); expect(updated.iat).toBe(original.iat);
    expect(updated.uid).toBe(base.uid); expect(updated.mfa).toBe(true); expect(updated.workspace).toBe("learner");
    expect(updated.activeHrConversationId).toBe("new"); expect(updated.hrHistoryVerifiedAt).toBeGreaterThan(0);
    await createSession({ ...(await readSession())!, workspace: "manager", mfa: false });
    expect((await readSession())!.loginId).toBe(original.loginId);
    await createSession(base);
    expect((await readSession())!.loginId).not.toBe(original.loginId);
    expect((await readSession())!.hrHistoryVerifiedAt).toBeUndefined(); expect((await readSession())!.activeHrConversationId).toBeUndefined();
    await destroySession(); expect(await readSession()).toBeNull();
  });
});
