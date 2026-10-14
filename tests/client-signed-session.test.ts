import { beforeEach, afterEach, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => ({
  value: undefined as string | undefined,
  maxAge: 0,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value ? { value: jar.value } : undefined),
    set: (_: string, value: string, options: { maxAge: number }) => {
      jar.value = value;
      jar.maxAge = options.maxAge;
    },
    delete: () => {
      jar.value = undefined;
    },
  }),
}));
import {
  createSession,
  readSession,
  destroySession,
  updateHrSession,
} from "../lib/auth/session";
beforeEach(() => {
  jar.value = undefined;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());
it("signs and reads each of the five roles through the real JWT path", async () => {
  for (const [role, workspace] of [
    ["ADMIN", "admin"],
    ["DEPARTMENT_HEAD", "department"],
    ["HR_HEAD", "hr"],
    ["INSTRUCTOR", "instructor"],
    ["LEARNER", "learner"],
  ] as const) {
    await createSession({
      uid: "u",
      role,
      workspace,
      shared: false,
      mfa: true,
    });
    expect(await readSession()).toMatchObject({
      uid: "u",
      role,
      workspace,
      mfa: true,
    });
  }
});
it("expires a shared-device session after fifteen minutes", async () => {
  await createSession({
    uid: "u",
    role: "LEARNER",
    workspace: "learner",
    shared: true,
    mfa: true,
  });
  expect(jar.maxAge).toBe(900);
  vi.setSystemTime(new Date("2026-10-14T10:15:00Z"));
  expect(await readSession()).toBeNull();
});
it("HR history verification preserves the original expiry", async () => {
  await createSession({
    uid: "u",
    role: "HR_HEAD",
    workspace: "hr",
    shared: true,
    mfa: true,
  });
  const original = (await readSession())!;
  vi.setSystemTime(new Date("2026-10-14T10:10:00Z"));
  await updateHrSession(original, { hrHistoryVerifiedAt: Date.now() });
  expect((await readSession())!.exp).toBe(original.exp);
  expect(jar.maxAge).toBe(300);
});
it("rejects tampering and clears the session on sign-out", async () => {
  await createSession({
    uid: "u",
    role: "LEARNER",
    workspace: "learner",
    shared: false,
    mfa: true,
  });
  jar.value = jar.value!.slice(0, -6) + "forged";
  expect(await readSession()).toBeNull();
  await destroySession();
  expect(await readSession()).toBeNull();
});
