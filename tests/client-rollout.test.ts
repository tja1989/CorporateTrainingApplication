import { expect, it, vi } from "vitest";
vi.mock("../lib/db/client", async () => ({
  t: await import("../lib/db/schema"),
  db: {},
}));
import { rolloutTraining } from "../lib/courses/rollout";
it("an Instructor cannot roll out training", async () => {
  await expect(
    rolloutTraining(
      { id: "trainer", role: "INSTRUCTOR", departmentId: "a" },
      {
        target: { type: "course", id: "approved" },
        audience: { type: "department", id: "a" },
        dueDays: 14,
      },
    ),
  ).rejects.toThrow("Not authorized");
});
it("rejects invalid due dates before making assignments", async () => {
  await expect(
    rolloutTraining(
      { id: "hr", role: "HR_HEAD", departmentId: null },
      {
        target: { type: "course", id: "approved" },
        audience: { type: "department", id: "a" },
        dueDays: 0,
      },
    ),
  ).rejects.toThrow("whole number");
});
