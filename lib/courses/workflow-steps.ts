/** Where a course sits in Instructor → Department Head → HR → live, for the approval stepper. */
export type WorkflowStepKey = "draft" | "review" | "publish" | "live";
export type WorkflowStep = { key: WorkflowStepKey; label: string; state: "done" | "current" | "upcoming"; note?: string };

const STEPS: Array<[WorkflowStepKey, string]> = [
  ["draft", "Draft"],
  ["review", "Department review"],
  ["publish", "HR publishes"],
  ["live", "Live"],
];

function currentStep({ status, approvalState }: { status: string; approvalState: string }): WorkflowStepKey {
  if (approvalState === "LEGACY_PUBLISHED") return "live";
  if (approvalState === "SUBMITTED") return "review";
  if (approvalState === "APPROVED") return status === "PUBLISHED" ? "live" : "publish";
  return "draft"; // DRAFT or REJECTED, including a new version of a published course
}

export function workflowSteps(course: { status: string; approvalState: string }): WorkflowStep[] {
  // An archived course is neither live nor waiting on anyone, so no step is current.
  const index = course.status === "ARCHIVED" ? -1 : STEPS.findIndex(([key]) => key === currentStep(course));
  return STEPS.map(([key, label], i) => ({
    key,
    label,
    state: index < 0 ? "upcoming" : i < index ? "done" : i === index ? "current" : "upcoming",
    ...(key === "draft" && course.approvalState === "REJECTED" ? { note: "Changes requested" } : {}),
  }));
}

export const APPROVAL_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting Department Head approval",
  APPROVED: "Approved for publication",
  REJECTED: "Changes requested",
  LEGACY_PUBLISHED: "Published before approvals",
};

/** The workflow chip beside "Approval and publication". */
export function workflowLabel({ status, approvalState }: { status: string; approvalState: string }) {
  if (status === "ARCHIVED") return "Archived";
  if (status === "PUBLISHED" && approvalState === "APPROVED") return "Published · approved";
  return APPROVAL_LABELS[approvalState] ?? approvalState;
}

/** Why course settings are read-only for this viewer. */
export function readOnlyReason({ status, approvalState }: { status: string; approvalState: string }) {
  if (status === "ARCHIVED") return "Archived. Settings are read-only.";
  if (status === "PUBLISHED") return "Published. Revise this course to make changes.";
  if (approvalState === "SUBMITTED") return "Waiting for Department Head review. Withdraw the submission to make changes.";
  return "Only the course's instructor can change these settings.";
}
