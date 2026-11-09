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

export const usedByLiveTraining = (titles: string[]) =>
  `Used by live training: ${titles.join(", ")}. Copy it to make changes.`;

/** HR Head and Admin manage any question; an author manages their own. A
 * question with no recorded author in a bank that belongs to a course
 * (written in that course before authors were recorded) is managed by the
 * people who author that course (`courseTeam`). */
export function canManageQuestion(i: {
  actor: Actor;
  authorId: string | null;
  courseTeam?: boolean;
}): boolean {
  return (
    i.actor.role === "HR_HEAD" ||
    i.actor.role === "ADMIN" ||
    i.actor.id === i.authorId ||
    (i.authorId === null && !!i.courseTeam)
  );
}

/** Why an actor may not edit a question in place, or null when they may. */
export function editBlockReason(i: {
  actor: Actor;
  authorId: string | null;
  courseTeam?: boolean;
  servedCount: number;
  liveCourseTitles: string[];
}): string | null {
  if (!canManageQuestion(i))
    return "Only the author, HR Head or Admin can edit this question.";
  if (i.servedCount > 0)
    return "Learners have already answered this question. Copy it to make changes.";
  if (i.liveCourseTitles.length > 0) return usedByLiveTraining(i.liveCourseTitles);
  return null;
}

/** Why an actor may not remove a question from its bank, or null when they
 * may. Removing keeps past attempts as they were, so learners having
 * answered it does not block it; quizzes still picking it, or live training
 * drawing from its bank, do. */
export function removeBlockReason(i: {
  actor: Actor;
  authorId: string | null;
  courseTeam?: boolean;
  pickedIn: string[];
  liveCourseTitles: string[];
}): string | null {
  if (!canManageQuestion(i))
    return "Only the author, HR Head or Admin can remove this question.";
  if (i.liveCourseTitles.length > 0) return liveRemovalBlocked(i.liveCourseTitles);
  if (i.pickedIn.length > 0)
    return `Picked in ${i.pickedIn.join(", ")}. Take it out of those quizzes first.`;
  return null;
}

export const liveRemovalBlocked = (titles: string[]) =>
  `Used by live training: ${titles.join(", ")}. It can't be removed while learners can get it.`;
