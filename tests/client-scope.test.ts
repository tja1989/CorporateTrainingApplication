import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ responses: [] as unknown[][] }));
vi.mock("../lib/db/client", async () => ({
  t: await import("../lib/db/schema"),
  db: {
    select: () => {
      const rows = state.responses.shift() ?? [];
      const query: any = {
        from: () => query,
        where: () => query,
        innerJoin: () => query,
        then: (resolve: any) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
  },
}));
import { trainingScope } from "../lib/auth/scope";
beforeEach(() => {
  state.responses = [];
});
it("unassigned department heads cannot read any records", async () => {
  expect(
    await trainingScope({
      id: "head",
      role: "DEPARTMENT_HEAD",
      departmentId: null,
    }),
  ).toEqual({ userIds: [], courseIds: [] });
});
it("department employee reports include common courses rather than course ownership", async () => {
  state.responses = [[{ id: "employee-a" }]];
  expect(
    await trainingScope({
      id: "head",
      role: "DEPARTMENT_HEAD",
      departmentId: "a",
    }),
  ).toEqual({ userIds: ["employee-a"] });
});
it("instructors with no assigned courses fail closed", async () => {
  expect(
    await trainingScope({
      id: "trainer",
      role: "INSTRUCTOR",
      departmentId: "a",
    }),
  ).toEqual({ userIds: [], courseIds: [] });
});
it("instructors only receive their courses and enrolled people", async () => {
  state.responses = [
    [{ id: "course-a" }],
    [{ userId: "employee-a" }, { userId: "employee-a" }],
  ];
  expect(
    await trainingScope({
      id: "trainer",
      role: "INSTRUCTOR",
      departmentId: "a",
    }),
  ).toEqual({ userIds: ["employee-a"], courseIds: ["course-a"] });
});
it("employees and unknown roles have no management scope", async () => {
  expect(
    await trainingScope({ id: "u", role: "LEARNER", departmentId: "a" }),
  ).toEqual({ userIds: [], courseIds: [] });
});
it("only HR and Super Admin receive organization scope", async () => {
  for (const role of ["HR_HEAD", "ADMIN"] as const)
    expect(await trainingScope({ id: "u", role, departmentId: null })).toEqual(
      {},
    );
});
