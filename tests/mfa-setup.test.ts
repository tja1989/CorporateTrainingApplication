import { beforeEach, describe, expect, it, vi } from "vitest";
import { totpCode } from "../lib/auth/totp";
const state = vi.hoisted(() => ({
  user: { id: "u1", role: "ADMIN", totpSecret: null as string | null, erasedAt: null, privacyNoticeVersion: 1 },
  session: { uid: "u1", role: "ADMIN", workspace: "admin", mfa: false },
  persistedSecret: null as string | null,
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("../lib/auth/session", () => ({ readSession: async () => state.session, createSession: async (session: typeof state.session) => { state.session = session; } }));
vi.mock("../lib/auth/login", () => ({ login: vi.fn(), activate: vi.fn(), verifyMfa: vi.fn() }));
vi.mock("../lib/db/client", () => ({ t: { users: { id: "id", totpSecret: "secret" } }, db: {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [state.user] }) }) }),
  update: () => ({ set: (values: { totpSecret: string }) => ({ where: () => ({ returning: async () => { state.persistedSecret = values.totpSecret; return [{ id: state.user.id }]; } }) }) }),
} }));
import { mfaSetupConfirm } from "../app/(auth)/actions";
const secret = "JBSWY3DPEHPK3PXP";
function submission() { const form = new FormData(); form.set("secret", secret); form.set("code", totpCode(secret)); return form; }
beforeEach(() => { state.user.totpSecret = null; state.session.mfa = false; state.persistedSecret = null; });
describe("initial MFA setup", () => {
  it("cannot replace an already configured authenticator", async () => {
    state.user.totpSecret = "existing";
    expect(await mfaSetupConfirm(null, submission())).toEqual({ error: "Two-factor authentication is already configured. Sign in with your authenticator code." });
    expect(state.persistedSecret).toBeNull();
  });
  it("marks the session verified after confirming the new authenticator", async () => {
    await expect(mfaSetupConfirm(null, submission())).rejects.toThrow("redirect:/privacy-notice");
    expect(state.persistedSecret).toBe(secret);
    expect(state.session.mfa).toBe(true);
  });
});
