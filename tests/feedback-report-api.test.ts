import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ actor: null as any, report: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ apiUser: async () => state.actor }));
vi.mock("@/lib/feedback/reports", () => ({
  feedbackReport: state.report,
  feedbackCsv: () => "safe csv",
}));
import { GET } from "../app/api/feedback/reports/csv/route";
beforeEach(() => {
  vi.clearAllMocks();
  state.actor = { id: "head", role: "DEPARTMENT_HEAD", departmentId: "own" };
  state.report.mockResolvedValue({});
});
it("denies unfinished sign-in and Employee report access", async () => {
  state.actor = null;
  expect(
    (await GET(new Request("https://local/api/feedback/reports/csv"))).status,
  ).toBe(403);
  state.actor = { id: "u", role: "LEARNER" };
  expect(
    (await GET(new Request("https://local/api/feedback/reports/csv"))).status,
  ).toBe(403);
  expect(state.report).not.toHaveBeenCalled();
});
it("rejects invalid kinds and reversed custom dates before querying", async () => {
  for (const query of [
    "kind=unknown",
    "period=custom&start=2026-10-03&end=2026-10-01",
  ]) {
    expect(
      (
        await GET(
          new Request("https://local/api/feedback/reports/csv?" + query),
        )
      ).status,
    ).toBe(400);
  }
  expect(state.report).not.toHaveBeenCalled();
});
it("CSV keeps the authenticated scope even when query parameters name a different department", async () => {
  const response = await GET(
    new Request(
      "https://local/api/feedback/reports/csv?kind=instructor&period=month&courseId=c&departmentId=foreign&role=ADMIN",
    ),
  );
  expect(response.status).toBe(200);
  expect(state.report).toHaveBeenCalledWith(
    state.actor,
    expect.objectContaining({ kind: "instructor", courseId: "c" }),
  );
  expect(state.report.mock.calls[0][0].departmentId).toBe("own");
  expect(response.headers.get("cache-control")).toContain("no-store");
});
