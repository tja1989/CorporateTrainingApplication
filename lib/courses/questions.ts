import { and, eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { canonicalRole, type Actor } from "@/lib/auth/roles";
import { hasPermission } from "@/lib/auth/permissions";
import { lockAssessmentCurriculum, lockCurriculum } from "./workflow";
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
    const courseIds = [
      ...new Set([
        ...references.map((r) => r.courseId),
        ...(bank?.courseId ? [bank.courseId] : []),
      ]),
    ].sort();
    for (const courseId of courseIds) {
      await lockCurriculum(tx, courseId);
      const [course] = await tx
        .select()
        .from(t.courses)
        .where(eq(t.courses.id, courseId))
        .limit(1);
      if (
        !course ||
        course.status !== "DRAFT" ||
        ["APPROVED", "SUBMITTED"].includes(course.approvalState)
      )
        throw new Error(
          "Revise affected courses before changing their assessment questions. Approval is currently locked.",
        );
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
    }
    await tx
      .update(t.questions)
      .set({ status })
      .where(
        and(eq(t.questions.id, questionId), eq(t.questions.status, "DRAFT")),
      );
  });
}
