import { expect, it, vi } from "vitest";
vi.mock("@/lib/db/client", async () => ({
  t: await import("../lib/db/schema"),
  db: {
    transaction: () => {
      throw new Error("Unexpected write");
    },
  },
}));
import { moderateFeedback } from "../lib/feedback/moderation";
const input = {
  kind: "course" as const,
  id: "response",
  expectedRevision: 1,
  hidden: true,
  excluded: false,
  reason: "Protect personal details",
  requestId: "moderate-1",
};
it("Instructor and Department Head cannot moderate", async () => {
  for (const role of ["INSTRUCTOR", "DEPARTMENT_HEAD"] as const)
    await expect(
      moderateFeedback({ id: "u", role, departmentId: "a" }, input),
    ).rejects.toThrow("Not authorized");
});
it("HR and Admin must record a nonblank reason and explicit booleans", async () => {
  for (const role of ["HR_HEAD", "ADMIN"] as const) {
    await expect(
      moderateFeedback(
        { id: "u", role, departmentId: null },
        { ...input, reason: "   " },
      ),
    ).rejects.toThrow("reason");
    await expect(
      moderateFeedback(
        { id: "u", role, departmentId: null },
        { ...input, hidden: "false" as unknown as boolean },
      ),
    ).rejects.toThrow("visibility");
  }
});
