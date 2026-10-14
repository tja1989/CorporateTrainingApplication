import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { totpCode } from "../lib/auth/totp";
const state = vi.hoisted(() => ({
  user: {} as Record<string, unknown>,
  session: {} as Record<string, unknown>,
  created: null as Record<string, unknown> | null,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("../lib/auth/rate-limit", () => ({
  throttled: async () => false,
  recordAttempt: async () => {},
}));
vi.mock("../lib/auth/session", () => ({
  createSession: async (data: Record<string, unknown>) => {
    state.created = data;
  },
  readSession: async () => state.session,
  destroySession: async () => {},
}));
vi.mock("../lib/auth/guard", () => ({
  requireRole: async () => state.user,
  requireUser: async () => ({ ...state.user, session: state.session }),
}));
vi.mock("../lib/db/client", () => ({
  t: { users: { id: "id", employeeId: "employee_id" }, consents: {} },
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [state.user] }) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({ returning: async () => { Object.assign(state.user, {...values, authVersion: Number(state.user.authVersion) + 1}); return [state.user]; } }),
      }),
    }),
    insert: () => ({ values: async () => {} }),
  },
}));
import { login, activate, verifyMfa, switchWorkspace } from "../lib/auth/login";
import { parsePeopleCsv } from "../lib/workspace-inputs";
const hash = bcrypt.hashSync("password123", 4);
beforeEach(() => {
  state.user = {
    id: "hr",
    employeeId: "HR1",
    role: "HR_HEAD",
    passwordHash: hash,
    passwordState: "ACTIVE",
    authVersion: 0,
    erasedAt: null,
    privacyNoticeVersion: 1,
    totpSecret: null,
  };
  state.session = { uid: "hr", role: "HR_HEAD", workspace: "hr", mfa: false };
  state.created = null;
});
describe("five-role credential lifecycle", () => {
  it("an HR password login routes through MFA setup and does not mark it verified", async () => {
    expect(await login("HR1", "password123", false)).toEqual({
      ok: true,
      next: "/login/mfa-setup",
    });
    expect(state.created).toMatchObject({
      role: "HR_HEAD",
      workspace: "hr",
      mfa: false,
    });
  });
  it("an HR account with an authenticator must verify it", async () => {
    state.user.totpSecret = "configured";
    expect(await login("HR1", "password123", false)).toEqual({
      ok: true,
      next: "/login/mfa",
    });
  });
  it("a verified HR account returns to HR rather than administrator pages", async () => {
    state.user.totpSecret = "JBSWY3DPEHPK3PXP";
    expect(await verifyMfa(totpCode(String(state.user.totpSecret)))).toEqual({
      ok: true,
      next: "/hr",
    });
    expect(state.created).toMatchObject({
      role: "HR_HEAD",
      workspace: "hr",
      mfa: true,
    });
  });
  it("activation of an HR identity does not exempt it from MFA", async () => {
    state.user.passwordState = "INVITED";
    state.user.inviteCodeHash = bcrypt.hashSync("CODE123", 4);
    expect(await activate("HR1", "CODE123", "new-password123")).toEqual({
      ok: true,
      next: "/login/mfa-setup",
    });
    expect(state.created?.mfa).toBe(false);
  });
  it("an unknown role cannot establish a signed session", async () => {
    state.user.role = "UNKNOWN";
    expect((await login("HR1", "password123", false)).ok).toBe(false);
    expect(state.created).toBeNull();
  });
  it("a stale administrator claim cannot select an administrator workspace", async () => {
    state.user.role = "LEARNER";
    state.session = { uid: "hr", role: "ADMIN", workspace: "admin", mfa: true };
    await expect(switchWorkspace("admin")).rejects.toThrow("redirect:/home");
    expect(state.created).toBeNull();
  });
  it("new imports accept five roles while rejecting the retired manager label", () => {
    expect(
      parsePeopleCsv(
        "X1,Trainer,INSTRUCTOR\nX2,HR,HR_HEAD\nX3,Head,DEPARTMENT_HEAD",
      ).rows,
    ).toHaveLength(3);
    expect(parsePeopleCsv("X4,Old,MANAGER").errors).toHaveLength(1);
  });
});

it("MFA cannot refresh a revoked login after reset and reactivation", async () => {
  state.user.totpSecret = "JBSWY3DPEHPK3PXP"; state.user.authVersion = 2;
  state.session.authVersion = 0;
  expect((await verifyMfa(totpCode(String(state.user.totpSecret)))).ok).toBe(false);
  expect(state.created).toBeNull();
});
