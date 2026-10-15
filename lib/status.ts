/** One vocabulary for every status a person can see. Colour only where attention is needed. */
export type StatusTone = "neutral" | "success" | "warning" | "destructive";
const STATUS: Record<string, [string, StatusTone]> = {
  ON_TRACK: ["On track", "neutral"], DUE_SOON: ["Due soon", "warning"], OVERDUE: ["Overdue", "destructive"],
  COMPLETED: ["Completed", "success"], COMPLETED_EXPIRING: ["Expiring soon", "warning"], EXPIRED: ["Expired", "destructive"],
  WITHDRAWN: ["Withdrawn", "neutral"], NOT_STARTED: ["Not started", "neutral"], IN_PROGRESS: ["In progress", "neutral"],
  ACTIVE: ["Active", "success"], INACTIVE: ["Inactive", "warning"], INVITED: ["Invited", "neutral"],
  DRAFT: ["Draft", "neutral"], PUBLISHED: ["Published", "success"], ARCHIVED: ["Archived", "neutral"],
  SUBMITTED: ["Awaiting approval", "warning"], APPROVED: ["Approved", "success"], REJECTED: ["Changes requested", "destructive"],
  LEGACY_PUBLISHED: ["Published before approvals", "neutral"], SUPERSEDED: ["Superseded", "neutral"], RETIRED: ["Retired", "neutral"],
  PENDING: ["Queued", "neutral"], FETCHING: ["Processing", "neutral"], CHUNKING: ["Processing", "neutral"],
  EMBEDDING: ["Processing", "neutral"], READY: ["Ready", "success"], FAILED: ["Failed", "destructive"],
};

export function isKnownStatus(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(STATUS, value);
}

export function statusLabel(status: string): { label: string; tone: StatusTone } {
  const known = STATUS[status];
  if (known) return { label: known[0], tone: known[1] };
  const words = status.toLowerCase().replaceAll("_", " ");
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: "neutral" };
}
