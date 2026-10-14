import { expect, it } from "vitest";
import {
  decideCourseAction,
  type ApprovalContext,
  type WorkflowInput,
} from "../lib/courses/approval-policy";
function context(changes: Partial<ApprovalContext> = {}): ApprovalContext {
  return {
    actor: { id: "head", role: "DEPARTMENT_HEAD", departmentId: "a" },
    state: "SUBMITTED",
    publication: "DRAFT",
    revision: 2,
    submittedRevision: 2,
    approvedRevision: null,
    submittedBy: "trainer",
    createdBy: "trainer",
    instructorId: "trainer",
    departmentId: "a",
    instructorActive: true,
    lessonCount: 2,
    approverCount: 1,
    ...changes,
  };
}
function input(
  action: WorkflowInput["action"],
  changes: Partial<WorkflowInput> = {},
): WorkflowInput {
  return {
    courseId: "c",
    action,
    revision: 2,
    requestId: "r",
    comment: "",
    ...changes,
  };
}
const trainer = {
  id: "trainer",
  role: "INSTRUCTOR" as const,
  departmentId: "a",
};
const hr = { id: "hr", role: "HR_HEAD" as const, departmentId: null };
const admin = { id: "admin", role: "ADMIN" as const, departmentId: null };
it("only the course department can approve", () => {
  expect(
    decideCourseAction(
      context({
        actor: { id: "other", role: "DEPARTMENT_HEAD", departmentId: "b" },
      }),
      input("approve"),
    ),
  ).toEqual({ ok: false, error: "This course is outside your department." });
  expect(decideCourseAction(context(), input("approve"))).toEqual({
    ok: true,
    state: "APPROVED",
    publication: "DRAFT",
  });
});
it("rejects self-approval by creator, submitter or instructor", () => {
  for (const field of ["createdBy", "submittedBy", "instructorId"] as const)
    expect(
      decideCourseAction(context({ [field]: "head" }), input("approve")).ok,
    ).toBe(false);
});
it("requires a comment to reject", () => {
  expect(
    decideCourseAction(context(), input("reject", { comment: "  " })).ok,
  ).toBe(false);
  expect(
    decideCourseAction(
      context(),
      input("reject", { comment: "Add safety assessment" }),
    ),
  ).toEqual({ ok: true, state: "REJECTED", publication: "DRAFT" });
});
it("rejects every stale revision token", () => {
  for (const action of [
    "submit",
    "withdraw",
    "approve",
    "reject",
    "publish",
    "revise",
    "archive",
    "override",
  ] as const)
    expect(
      decideCourseAction(context(), input(action, { revision: 1 })).ok,
    ).toBe(false);
});
it("instructors submit only their own valid drafts", () => {
  const draft = context({
    actor: trainer,
    state: "DRAFT",
    submittedRevision: null,
  });
  expect(decideCourseAction(draft, input("submit"))).toEqual({
    ok: true,
    state: "SUBMITTED",
    publication: "DRAFT",
  });
  expect(
    decideCourseAction(
      { ...draft, instructorId: "someone-else" },
      input("submit"),
    ).ok,
  ).toBe(false);
  for (const change of [
    { departmentId: null },
    { instructorId: null },
    { instructorActive: false },
    { lessonCount: 0 },
    { approverCount: 0 },
  ])
    expect(
      decideCourseAction({ ...draft, ...change }, input("submit")).ok,
    ).toBe(false);
});
it("authors can withdraw a submitted course before editing", () => {
  expect(
    decideCourseAction(context({ actor: trainer }), input("withdraw")),
  ).toEqual({ ok: true, state: "DRAFT", publication: "DRAFT" });
  expect(decideCourseAction(context(), input("withdraw")).ok).toBe(false);
});
it("HR publishes only the current approved revision", () => {
  const approved = context({
    actor: hr,
    state: "APPROVED",
    approvedRevision: 2,
  });
  expect(decideCourseAction(approved, input("publish"))).toEqual({
    ok: true,
    state: "APPROVED",
    publication: "PUBLISHED",
  });
  expect(
    decideCourseAction(
      { ...approved, revision: 3 },
      input("publish", { revision: 3 }),
    ).ok,
  ).toBe(false);
  for (const actor of [trainer, admin, context().actor])
    expect(
      decideCourseAction({ ...approved, actor }, input("publish")).ok,
    ).toBe(false);
});
it("a draft or rejected course cannot be published", () => {
  for (const state of ["DRAFT", "REJECTED", "SUBMITTED"] as const)
    expect(
      decideCourseAction(context({ actor: hr, state }), input("publish")).ok,
    ).toBe(false);
});
it("an author explicitly revises a publication and restarts approval", () => {
  expect(
    decideCourseAction(
      context({
        actor: trainer,
        state: "APPROVED",
        publication: "PUBLISHED",
        approvedRevision: 2,
      }),
      input("revise"),
    ),
  ).toEqual({ ok: true, state: "DRAFT", publication: "DRAFT" });
});
it("HR or Admin can archive but instructors cannot", () => {
  for (const actor of [hr, admin])
    expect(
      decideCourseAction(
        context({ actor, publication: "PUBLISHED" }),
        input("archive"),
      ),
    ).toEqual({ ok: true, state: "SUBMITTED", publication: "ARCHIVED" });
  expect(
    decideCourseAction(context({ actor: trainer }), input("archive")).ok,
  ).toBe(false);
});
it("Admin intervention requires a reason and consistent explicit target states", () => {
  expect(
    decideCourseAction(
      context({ actor: admin }),
      input("override", {
        overrideState: "APPROVED",
        overridePublication: "PUBLISHED",
        comment: "Urgent compliance rollout",
      }),
    ),
  ).toEqual({ ok: true, state: "APPROVED", publication: "PUBLISHED" });
  for (const change of [
    { comment: " " },
    { overrideState: undefined },
    { overridePublication: undefined },
    {
      overrideState: "DRAFT" as const,
      overridePublication: "PUBLISHED" as const,
    },
  ])
    expect(
      decideCourseAction(
        context({ actor: admin }),
        input("override", {
          overrideState: "APPROVED",
          overridePublication: "PUBLISHED",
          comment: "Reason",
          ...change,
        }),
      ).ok,
    ).toBe(false);
  expect(
    decideCourseAction(
      context({ actor: hr }),
      input("override", {
        comment: "Reason",
        overrideState: "APPROVED",
        overridePublication: "DRAFT",
      }),
    ).ok,
  ).toBe(false);
});
