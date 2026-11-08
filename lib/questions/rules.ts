import type { Actor } from "@/lib/auth/roles";

export type CourseState = {
  id: string;
  title: string;
  status: string;
  approvalState: string;
};
type Publication = Pick<CourseState, "status" | "approvalState">;

/** Learners are served it now, or will be once approval completes.
 * Archived courses are neither live nor draft. */
export function isLiveCourse(c: Publication): boolean {
  if (c.status === "ARCHIVED") return false;
  return (
    c.status === "PUBLISHED" ||
    c.approvalState === "SUBMITTED" ||
    c.approvalState === "APPROVED"
  );
}

/** A draft that can change, at the cost of a new revision and a fresh approval. */
export function isDraftCourse(c: Publication): boolean {
  return c.status === "DRAFT" && !isLiveCourse(c);
}

/** Why an actor may not edit a question in place, or null when they may. */
export function editBlockReason(i: {
  actor: Actor;
  authorId: string | null;
  servedCount: number;
  liveCourseTitles: string[];
}): string | null {
  const manager = i.actor.role === "HR_HEAD" || i.actor.role === "ADMIN";
  if (!manager && i.actor.id !== i.authorId)
    return "Only the author, HR Head or Admin can edit this question.";
  if (i.servedCount > 0)
    return "Learners have already answered this question. Copy it to make changes.";
  if (i.liveCourseTitles.length > 0)
    return `Used by live training: ${i.liveCourseTitles.join(", ")}. Copy it to make changes.`;
  return null;
}
