import { and, eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { canonicalRole, type Actor } from "@/lib/auth/roles";
import { hasPermission } from "@/lib/auth/permissions";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";
import { isLiveCourse } from "@/lib/questions/rules";
import { lockAssessmentCurriculum, lockCurriculum } from "./workflow";
type Course = typeof t.courses.$inferSelect;
/** Locks each course in id order and re-reads it. Throws `refusal(course)`
 * when it returns a message; otherwise the course (if it exists) gets a new
 * content revision with approval reset. Its status is never changed.
 * Returns the ids of the courses that got a new revision. */
async function startNewRevisions(
  tx: LearningTransaction,
  courseIds: string[],
  refusal: (course: Course | undefined) => string | null,
): Promise<string[]> {
  const bumped: string[] = [];
  for (const courseId of [...new Set(courseIds)].sort()) {
    await lockCurriculum(tx, courseId);
    const [course] = await tx
      .select()
      .from(t.courses)
      .where(eq(t.courses.id, courseId))
      .limit(1);
    const reason = refusal(course);
    if (reason) throw new Error(reason);
    if (!course) continue;
    await tx
      .update(t.courses)
      .set({
        contentRevision: course.contentRevision + 1,
        approvalState: "DRAFT",
        submittedRevision: null,
        approvedRevision: null,
        submittedBy: null,
        approvedBy: null,
      })
      .where(eq(t.courses.id, courseId));
    bumped.push(courseId);
  }
  return bumped;
}
/** Returns each course to a new draft revision with approval reset, locking
 * courses in id order. Refuses when any course is not an unsubmitted draft.
 * Call after `lockAssessmentCurriculum(tx)`. */
export async function reopenDraftCourses(
  tx: LearningTransaction,
  courseIds: string[],
): Promise<void> {
  await startNewRevisions(tx, courseIds, (course) =>
    !course ||
    course.status !== "DRAFT" ||
    ["APPROVED", "SUBMITTED"].includes(course.approvalState)
      ? "Revise affected courses before changing their assessment questions. Approval is currently locked."
      : null,
  );
}
/** For shared-bank writes: draft courses get a new revision, and archived
 * courses lose their approval too (they stay archived), so republishing one
 * needs a fresh approval of the changed content. A course found live under
 * its lock refuses with `liveError`. Call after `lockAssessmentCurriculum(tx)`. */
export async function revokeCourseApprovals(
  tx: LearningTransaction,
  courseIds: string[],
  liveError: (titles: string[]) => string,
): Promise<string[]> {
  return startNewRevisions(tx, courseIds, (course) =>
    course && isLiveCourse(course) ? liveError([course.title]) : null,
  );
}
/** Question-bank changes alter randomized assessments, so their users must
 * return to draft and receive a fresh approval revision as well. */
export async function updateDraftQuestion(
  actor: Actor,
  questionId: string,
  status: "APPROVED" | "RETIRED",
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockAssessmentCurriculum(tx);
    const [person] = await tx
      .select()
      .from(t.users)
      .where(eq(t.users.id, actor.id))
      .limit(1);
    if (
      !person ||
      person.erasedAt ||
      person.passwordState !== "ACTIVE" ||
      canonicalRole(person.role) !== actor.role ||
      !hasPermission(actor.role, "assessment.review")
    )
      throw new Error("Not authorized to review questions.");
    const [question] = await tx
      .select()
      .from(t.questions)
      .where(eq(t.questions.id, questionId))
      .limit(1);
    if (!question || question.status !== "DRAFT")
      throw new Error("Only draft questions can be reviewed here.");
    const [bank] = await tx
      .select()
      .from(t.questionBanks)
      .where(eq(t.questionBanks.id, question.bankId))
      .limit(1);
    const references = await tx
      .select({ courseId: t.modules.courseId })
      .from(t.lessons)
      .innerJoin(t.modules, eq(t.modules.id, t.lessons.moduleId))
      .innerJoin(
        t.quizzes,
        sql`${t.lessons.payload}->>'quizId'=${t.quizzes.id}`,
      )
      .where(
        sql`EXISTS(SELECT 1 FROM jsonb_array_elements(${t.quizzes.sections}) s WHERE s->>'bankId'=${question.bankId} OR (s->'fixed') ? ${questionId})`,
      );
    await reopenDraftCourses(tx, [
      ...references.map((r) => r.courseId),
      ...(bank?.courseId ? [bank.courseId] : []),
    ]);
    await tx
      .update(t.questions)
      .set({ status })
      .where(
        and(eq(t.questions.id, questionId), eq(t.questions.status, "DRAFT")),
      );
  });
}
