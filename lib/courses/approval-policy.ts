import type { Actor } from "@/lib/auth/roles";
import { canAuthorCourse } from "./ownership";
export type ApprovalState =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "LEGACY_PUBLISHED";
export type CourseAction =
  | "submit"
  | "withdraw"
  | "approve"
  | "reject"
  | "publish"
  | "revise"
  | "archive"
  | "override";
export type WorkflowInput = {
  courseId: string;
  action: CourseAction;
  revision: number;
  requestId: string;
  comment: string;
  overrideState?: ApprovalState;
  overridePublication?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};
export type ApprovalContext = {
  actor: Actor;
  state: ApprovalState;
  publication: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  revision: number;
  submittedRevision: number | null;
  approvedRevision: number | null;
  submittedBy: string | null;
  createdBy: string | null;
  instructorId: string | null;
  departmentId: string | null;
  instructorActive: boolean;
  lessonCount: number;
  approverCount: number;
};
export type Decision =
  | {
      ok: true;
      state: ApprovalState;
      publication: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    }
  | { ok: false; error: string };
export function decideCourseAction(
  c: ApprovalContext,
  input: WorkflowInput,
): Decision {
  const deny = (error: string): Decision => ({ ok: false, error });
  const allow = (state = c.state, publication = c.publication): Decision => ({
    ok: true,
    state,
    publication,
  });
  if (!Number.isInteger(input.revision) || input.revision !== c.revision)
    return deny("This course changed. Reload before trying again.");
  if (!input.requestId.trim())
    return deny("A request ID is required. Reload and try again.");
  if (input.comment.length > 2000)
    return deny("Keep comments within 2,000 characters.");
  const author = canAuthorCourse(c.actor, c);
  switch (input.action) {
    case "submit":
      if (!author) return deny("You cannot submit this course.");
      if (c.publication !== "DRAFT" || !["DRAFT", "REJECTED"].includes(c.state))
        return deny("Only a draft can be submitted.");
      if (!c.departmentId)
        return deny("Assign a department before submitting.");
      if (!c.instructorId || !c.instructorActive)
        return deny("Assign an active Instructor before submitting.");
      if (!c.lessonCount)
        return deny("Add at least one lesson before submitting.");
      if (!c.approverCount)
        return deny("This department has no eligible Department Head.");
      return allow("SUBMITTED", "DRAFT");
    case "withdraw":
      if (!author || c.state !== "SUBMITTED" || c.publication !== "DRAFT")
        return deny("Only the author can withdraw a submitted draft.");
      return allow("DRAFT", "DRAFT");
    case "approve":
    case "reject":
      if (c.actor.role !== "DEPARTMENT_HEAD")
        return deny("Only a Department Head can decide this submission.");
      if (!c.actor.departmentId || c.actor.departmentId !== c.departmentId)
        return deny("This course is outside your department.");
      if ([c.createdBy, c.submittedBy, c.instructorId].includes(c.actor.id))
        return deny("You cannot approve or reject your own submission.");
      if (
        c.state !== "SUBMITTED" ||
        c.publication !== "DRAFT" ||
        c.submittedRevision !== c.revision
      )
        return deny("This revision is no longer awaiting a decision.");
      if (input.action === "reject" && !input.comment.trim())
        return deny("Give a reason for rejecting this course.");
      return allow(
        input.action === "approve" ? "APPROVED" : "REJECTED",
        "DRAFT",
      );
    case "publish":
      if (c.actor.role !== "HR_HEAD")
        return deny(
          "Only HR Head can publish an approved course. Super Admin must use a recorded intervention.",
        );
      if (
        c.publication !== "DRAFT" ||
        c.state !== "APPROVED" ||
        c.approvedRevision !== c.revision
      )
        return deny(
          "This revision needs Department Head approval before publication.",
        );
      return allow("APPROVED", "PUBLISHED");
    case "revise":
      if (!author || c.publication !== "PUBLISHED")
        return deny("Only an authorized author can revise a published course.");
      return allow("DRAFT", "DRAFT");
    case "archive":
      if (!["HR_HEAD", "ADMIN"].includes(c.actor.role))
        return deny("Only HR Head or Super Admin can archive courses.");
      if (c.publication === "ARCHIVED")
        return deny("This course is already archived.");
      return allow(c.state, "ARCHIVED");
    case "override": {
      if (c.actor.role !== "ADMIN" || !input.comment.trim())
        return deny("Super Admin intervention requires a recorded reason.");
      const state = input.overrideState,
        publication = input.overridePublication;
      if (
        !state ||
        ![
          "DRAFT",
          "SUBMITTED",
          "APPROVED",
          "REJECTED",
          "LEGACY_PUBLISHED",
        ].includes(state) ||
        !publication ||
        !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(publication)
      )
        return deny("Choose explicit approval and publication states.");
      if (
        publication === "PUBLISHED" &&
        !["APPROVED", "LEGACY_PUBLISHED"].includes(state)
      )
        return deny("Published courses must have an approved state.");
      if (state === "LEGACY_PUBLISHED" && c.state !== "LEGACY_PUBLISHED")
        return deny("Legacy publication is reserved for migrated courses.");
      return allow(state, publication);
    }
    default:
      return deny("Choose a valid course action.");
  }
}
