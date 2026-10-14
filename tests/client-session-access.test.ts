import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  session: null as Record<string, unknown> | null,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("../lib/auth/session", () => ({
  readSession: async () => state.session,
}));
vi.mock("../lib/db/client", () => ({
  t: { users: { id: "id" } },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (state.user ? [state.user] : []) }),
      }),
    }),
  },
}));
import {
  currentUser,
  apiUser,
  requireUser,
  requireRole,
} from "../lib/auth/guard";
beforeEach(() => {
  state.user = {
    id: "u",
    role: "LEARNER",
    passwordState: "ACTIVE",
    departmentId: "a",
    erasedAt: null,
    privacyNoticeVersion: 1,
    totpSecret: null,
  };
  state.session = {
    uid: "u",
    role: "ADMIN",
    workspace: "admin",
    mfa: true,
    shared: false,
  };
});
describe("database-authoritative role access", () => {
  it("an account reset revokes an existing signed session", async () => {
    state.user!.passwordState = "INVITED";
    expect(await currentUser()).toBeNull();
    expect(await apiUser()).toBeNull();
  });
  it("rejects missing sessions and erased accounts", async () => {
    const original = state.session;
    state.session = null;
    expect(await currentUser()).toBeNull();
    state.session = original;
    state.user!.erasedAt = new Date();
    expect(await apiUser()).toBeNull();
    await expect(requireUser()).rejects.toThrow("redirect:/login");
  });
  it("revokes administrator access even while its old signed claim remains", async () => {
    const user = await currentUser();
    expect(user?.role).toBe("LEARNER");
    expect(user?.session.role).toBe("LEARNER");
    expect(user?.session.workspace).toBe("learner");
    await expect(requireRole("ADMIN")).rejects.toThrow("redirect:/home");
  });
  it("canonicalizes a legacy manager workspace without granting HR", async () => {
    state.user!.role = "MANAGER";
    state.session!.workspace = "manager";
    expect((await currentUser())?.session.workspace).toBe("department");
    expect((await requireRole("MANAGER")).role).toBe("DEPARTMENT_HEAD");
    await expect(requireRole("HR_HEAD")).rejects.toThrow("redirect:/home");
  });
  it("rejects an unknown database role", async () => {
    state.user!.role = "UNRECOGNIZED";
    expect(await currentUser()).toBeNull();
  });
  it("HR needs authenticator setup and verification on pages and APIs", async () => {
    state.user!.role = "HR_HEAD";
    state.session!.role = "HR_HEAD";
    state.session!.mfa = false;
    await expect(requireUser()).rejects.toThrow("redirect:/login/mfa-setup");
    expect(await apiUser()).toBeNull();
    state.user!.totpSecret = "configured";
    await expect(requireUser()).rejects.toThrow("redirect:/login/mfa");
    state.session!.mfa = true;
    expect((await apiUser())?.role).toBe("HR_HEAD");
  });
  it("a promotion does not reuse the previous role's MFA exemption", async () => {
    state.user!.role = "HR_HEAD";
    state.user!.totpSecret = "configured";
    state.session!.role = "LEARNER";
    state.session!.mfa = true;
    expect(await apiUser()).toBeNull();
  });
});
