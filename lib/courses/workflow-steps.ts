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
  const index = STEPS.findIndex(([key]) => key === currentStep(course));
  return STEPS.map(([key, label], i) => ({
    key,
    label,
    state: i < index ? "done" : i === index ? "current" : "upcoming",
    ...(key === "draft" && course.approvalState === "REJECTED" ? { note: "Changes requested" } : {}),
  }));
}
