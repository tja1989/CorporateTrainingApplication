import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  scope: {} as Record<string, unknown>,
  planFilters: {} as Record<string, unknown>,
  run: vi.fn(async () => ({
    title: "Report",
    columns: ["Employee"],
    rows: [],
  })),
}));
vi.mock("@/lib/auth/guard", () => ({
  currentUser: async () => state.user,
  teamOf: async () => [],
}));
vi.mock("@/lib/auth/scope", () => ({ trainingScope: async () => state.scope }));
vi.mock("@/lib/ai/gateway", () => ({ aiAvailable: () => false }));
vi.mock("@/lib/reports", () => ({
  runReport: state.run,
  toCsv: () => "Employee",
  narrate: () => "No rows",
  planFromQuestion: async () => ({
    report: "engagement",
    filters: { ...state.planFilters },
    explanation: "test",
  }),
}));
import { GET } from "../app/api/reports/[reportId]/csv/route";
import { POST } from "../app/api/reports/ask/route";
beforeEach(() => {
  state.run.mockClear();
  state.scope = {};
  state.planFilters = {};
  state.user = {
    id: "admin",
    role: "ADMIN",
    departmentId: null,
    privacyNoticeVersion: 1,
    totpSecret: "configured",
    session: { mfa: true },
  };
});
const readCsv = () =>
  GET(new Request("https://localhost/api/reports/engagement/csv"), {
    params: Promise.resolve({ reportId: "engagement" }),
  });
const ask = () =>
  POST(
    new Request("https://localhost/api/reports/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Show engagement" }),
      headers: { "Content-Type": "application/json" },
    }),
  );
for (const [label, request] of [
  ["CSV", readCsv],
  ["Ask Reports", ask],
] as const)
  describe(`${label} workspace permission gate`, () => {
    it("rejects an administrator whose MFA is not verified", async () => {
      state.user!.session = { mfa: false };
      expect((await request()).status).toBe(403);
      expect(state.run).not.toHaveBeenCalled();
    });
    it("rejects an administrator who has not configured MFA", async () => {
      state.user!.totpSecret = null;
      expect((await request()).status).toBe(403);
      expect(state.run).not.toHaveBeenCalled();
    });
    it("requires the privacy acknowledgment for managers too", async () => {
      state.user!.role = "MANAGER";
      state.user!.privacyNoticeVersion = 0;
      expect((await request()).status).toBe(403);
      expect(state.run).not.toHaveBeenCalled();
    });
    it("retains access for verified administrators", async () => {
      expect((await request()).status).toBe(200);
      expect(state.run).toHaveBeenCalledOnce();
    });
    it("injects Instructor scope even if a model or URL supplies a larger scope", async () => {
      state.user!.role = "INSTRUCTOR";
      state.scope = { userIds: ["own-learner"], courseIds: ["own-course"] };
      state.planFilters = {
        userIds: ["unrelated"],
        courseIds: ["unrelated-course"],
        instructorView: false,
      };
      expect((await request()).status).toBe(200);
      expect(state.run).toHaveBeenCalledWith(
        "engagement",
        expect.objectContaining({
          userIds: ["own-learner"],
          courseIds: ["own-course"],
          instructorView: true,
        }),
      );
    });
    it("Department Head reports use department membership", async () => {
      state.user!.role = "DEPARTMENT_HEAD";
      state.scope = { userIds: ["department-learner"] };
      expect((await request()).status).toBe(200);
      expect(state.run).toHaveBeenCalledWith(
        "engagement",
        expect.objectContaining({ userIds: ["department-learner"] }),
      );
    });
  });

it("keeps an administrator's explicit team export scoped to the team page", async () => {
  await GET(
    new Request("https://localhost/api/reports/engagement/csv?scope=team"),
    { params: Promise.resolve({ reportId: "engagement" }) },
  );
  expect(state.run).toHaveBeenCalledWith(
    "engagement",
    expect.objectContaining({ userIds: [] }),
  );
});
it("keeps an administrator's explicit team question scoped to the team page", async () => {
  await POST(
    new Request("https://localhost/api/reports/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Show engagement", scope: "team" }),
      headers: { "Content-Type": "application/json" },
    }),
  );
  expect(state.run).toHaveBeenCalledWith(
    "engagement",
    expect.objectContaining({ userIds: [] }),
  );
});
