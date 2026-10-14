import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, session: null as Record<string, unknown> | null }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("../lib/auth/session", () => ({ readSession: async () => state.session }));
vi.mock("../lib/db/client", () => ({ t: { users: { id: "id" } }, db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => state.user ? [state.user] : [] }) }) }) } }));
import { requireUser } from "../lib/auth/guard";

beforeEach(() => {
  state.user = { id: "u1", role: "ADMIN", totpSecret: null, privacyNoticeVersion: 1, erasedAt: null };
  state.session = { uid: "u1", role: "ADMIN", workspace: "admin", mfa: true };
});
describe("mandatory administrator authentication", () => {
  it("requires MFA setup before a direct request can enter a workspace", async () => {
    await expect(requireUser()).rejects.toThrow("redirect:/login/mfa-setup");
  });
  it("requires verification for a configured administrator", async () => {
    state.user!.totpSecret = "configured";
    state.session!.mfa = false;
    await expect(requireUser()).rejects.toThrow("redirect:/login/mfa");
  });
  it("allows a verified administrator with privacy consent", async () => {
    state.user!.totpSecret = "configured";
    expect((await requireUser()).id).toBe("u1");
  });
  it("preserves employee access without requiring administrator MFA", async () => {
    state.user!.role = "LEARNER";
    state.session!.role = "LEARNER";
    expect((await requireUser()).id).toBe("u1");
  });
  it("preserves privacy acknowledgment after authentication", async () => {
    state.user!.totpSecret = "configured";
    state.user!.privacyNoticeVersion = 0;
    await expect(requireUser()).rejects.toThrow("redirect:/privacy-notice");
  });
});
