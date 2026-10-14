import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { canonicalRole, type Actor } from "@/lib/auth/roles";
import { notify } from "@/lib/notify";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";
import { decideCourseAction, type WorkflowInput } from "./approval-policy";
import {
  canAuthorCourse,
  canReadCourse,
  courseWorkspacePath,
} from "./ownership";

export async function lockCurriculum(
  tx: LearningTransaction,
  courseId: string,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`curriculum:${courseId}`},0))`,
  );
}
export async function lockAssessmentCurriculum(tx: LearningTransaction) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('assessment-curriculum',0))`,
  );
}
async function freshActor(
  tx: LearningTransaction,
  actor: Actor,
): Promise<Actor> {
  const [person] = await tx
    .select()
    .from(t.users)
    .where(eq(t.users.id, actor.id))
    .limit(1);
  const role = person && canonicalRole(person.role);
  if (
    !person ||
    person.erasedAt ||
    person.passwordState !== "ACTIVE" ||
    !role ||
    role !== actor.role
  )
    throw new Error("Your account access changed. Sign in again.");
  return { id: person.id, role, departmentId: person.departmentId };
}
export async function mutateDraftCourse<T>(
  actor: Actor,
  courseId: string,
  run: (tx: LearningTransaction) => Promise<T>,
  expectedRevision?: number,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockAssessmentCurriculum(tx);
    await lockCurriculum(tx, courseId);
    const current = await freshActor(tx, actor);
    const [course] = await tx
      .select()
      .from(t.courses)
      .where(eq(t.courses.id, courseId))
      .limit(1);
    if (!course || !canAuthorCourse(current, course))
      throw new Error("You cannot edit this course.");
    if (course.status !== "DRAFT")
      throw new Error("Revise this published course before editing.");
    if (course.approvalState === "SUBMITTED")
      throw new Error("Withdraw this submitted course before editing.");
    if (
      expectedRevision !== undefined &&
      expectedRevision !== course.contentRevision
    )
      throw new Error("This course changed. Reload before saving.");
    const result = await run(tx);
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
    return result;
  });
}
export async function validateCurriculum(
  tx: LearningTransaction,
  courseId: string,
): Promise<number> {
  const lessons = await tx
    .select({ lesson: t.lessons })
    .from(t.lessons)
    .innerJoin(t.modules, eq(t.lessons.moduleId, t.modules.id))
    .where(eq(t.modules.courseId, courseId));
  for (const { lesson } of lessons) {
    if (!lesson.title.trim()) throw new Error("Each lesson needs a title.");
    if (lesson.type === "TEXT" && !lesson.payload.body?.trim())
      throw new Error("Each text lesson needs content.");
    if (lesson.type === "PDF" && !lesson.payload.fileUrl)
      throw new Error("Each PDF lesson needs a file.");
    if (lesson.type === "VIDEO") {
      const [video] = lesson.payload.videoId
        ? await tx
            .select()
            .from(t.videos)
            .where(eq(t.videos.id, lesson.payload.videoId))
            .limit(1)
        : [];
      if (video?.ingestionStatus !== "READY")
        throw new Error(
          "Every video transcript must be ready before submission or publication.",
        );
    }
    if (lesson.type === "QUIZ") {
      const [quiz] = lesson.payload.quizId
        ? await tx
            .select()
            .from(t.quizzes)
            .where(eq(t.quizzes.id, lesson.payload.quizId))
            .limit(1)
        : [];
      if (!quiz?.sections.length)
        throw new Error("Each assessment needs configured questions.");
      const used = new Set<string>();
      const randomCounts = new Map<string, number>();
      for (const section of quiz.sections) {
        if (section.fixed?.length) {
          const questions = await tx
            .select({ id: t.questions.id })
            .from(t.questions)
            .where(
              and(
                inArray(t.questions.id, section.fixed),
                eq(t.questions.status, "APPROVED"),
              ),
            );
          if (
            questions.length !== new Set(section.fixed).size ||
            section.fixed.some((q) => used.has(q))
          )
            throw new Error(
              "Fixed assessment questions must be approved and unique.",
            );
          questions.forEach((q) => used.add(q.id));
        } else if (
          section.bankId &&
          Number.isInteger(section.pickN) &&
          section.pickN! > 0
        ) {
          randomCounts.set(
            section.bankId,
            (randomCounts.get(section.bankId) ?? 0) + section.pickN!,
          );
        } else
          throw new Error("Each assessment section needs valid questions.");
      }
      for (const [bankId, count] of randomCounts) {
        const questions = await tx
          .select({ id: t.questions.id })
          .from(t.questions)
          .where(
            and(
              eq(t.questions.bankId, bankId),
              eq(t.questions.status, "APPROVED"),
            ),
          );
        if (questions.filter((q) => !used.has(q.id)).length < count)
          throw new Error(
            "An assessment bank has too few approved questions for its configured count.",
          );
      }
    }
  }
  return lessons.length;
}
export async function transitionCourse(
  actor: Actor,
  input: WorkflowInput,
): Promise<void> {
  const afterCommit: Array<() => Promise<void>> = [];
  await db.transaction(async (tx) => {
    if (!input.requestId || input.requestId.length > 160)
      throw new Error("Use a valid request ID.");
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workflow-request:${input.requestId}`},0))`,
    );
    await lockAssessmentCurriculum(tx);
    await lockCurriculum(tx, input.courseId);
    const current = await freshActor(tx, actor);
    const [course] = await tx
      .select()
      .from(t.courses)
      .where(eq(t.courses.id, input.courseId))
      .limit(1);
    if (!course || !canReadCourse(current, course))
      throw new Error("You cannot access this course.");
    const [replay] = await tx
      .select()
      .from(t.courseWorkflowEvents)
      .where(eq(t.courseWorkflowEvents.requestId, input.requestId))
      .limit(1);
    if (replay) {
      if (
        replay.actorId !== current.id ||
        replay.courseId !== course.id ||
        replay.action !== input.action
      )
        throw new Error("This request belongs to another course action.");
      return;
    }
    const [instructor] = course.instructorId
      ? await tx
          .select()
          .from(t.users)
          .where(eq(t.users.id, course.instructorId))
          .limit(1)
      : [];
    const approvers = course.departmentId
      ? await tx
          .select()
          .from(t.users)
          .where(
            and(
              eq(t.users.departmentId, course.departmentId),
              eq(t.users.role, "DEPARTMENT_HEAD"),
              isNull(t.users.erasedAt),
              eq(t.users.passwordState, "ACTIVE"),
            ),
          )
      : [];
    const needsValidation =
      input.action === "submit" ||
      input.action === "publish" ||
      (input.action === "override" &&
        (input.overridePublication === "PUBLISHED" ||
          input.overrideState === "APPROVED"));
    const lessonCount = needsValidation
      ? await validateCurriculum(tx, course.id)
      : 0;
    const decision = decideCourseAction(
      {
        actor: current,
        state: course.approvalState,
        publication: course.status,
        revision: course.contentRevision,
        submittedRevision: course.submittedRevision,
        approvedRevision: course.approvedRevision,
        submittedBy: course.submittedBy,
        createdBy: course.createdBy,
        instructorId: course.instructorId,
        departmentId: course.departmentId,
        instructorActive:
          !!instructor &&
          !instructor.erasedAt &&
          instructor.passwordState === "ACTIVE" &&
          canonicalRole(instructor.role) === "INSTRUCTOR",
        lessonCount,
        approverCount: approvers.filter(
          (a) =>
            ![course.createdBy, current.id, course.instructorId].includes(a.id),
        ).length,
      },
      input,
    );
    if (!decision.ok) throw new Error(decision.error);
    const submitted = decision.state === "SUBMITTED",
      approved = decision.state === "APPROVED";
    await tx
      .update(t.courses)
      .set({
        approvalState: decision.state,
        status: decision.publication,
        submittedRevision: submitted
          ? course.contentRevision
          : approved
            ? course.submittedRevision
            : null,
        submittedBy: submitted
          ? input.action === "submit"
            ? current.id
            : course.submittedBy
          : approved
            ? course.submittedBy
            : null,
        approvedRevision: approved ? course.contentRevision : null,
        approvedBy: approved
          ? input.action === "approve" || input.action === "override"
            ? current.id
            : course.approvedBy
          : null,
        publishedAt:
          decision.publication === "PUBLISHED"
            ? new Date()
            : course.publishedAt,
      })
      .where(eq(t.courses.id, course.id));
    await tx
      .insert(t.courseWorkflowEvents)
      .values({
        id: id(),
        courseId: course.id,
        actorId: current.id,
        actorRole: current.role,
        action: input.action,
        revision: course.contentRevision,
        fromState: course.approvalState,
        toState: decision.state,
        fromPublication: course.status,
        toPublication: decision.publication,
        comment: input.comment.trim(),
        requestId: input.requestId,
      });
    const recipients = new Map<string, typeof t.users.$inferSelect>();
    if (instructor && !instructor.erasedAt)
      recipients.set(instructor.id, instructor);
    let kind:
      | "course_submitted"
      | "course_approved"
      | "course_rejected"
      | "course_published"
      | "course_workflow_updated" = "course_workflow_updated";
    if (input.action === "submit") {
      recipients.clear();
      approvers.forEach((a) => recipients.set(a.id, a));
      kind = "course_submitted";
    }
    if (input.action === "approve") {
      kind = "course_approved";
      const hrs = await tx
        .select()
        .from(t.users)
        .where(and(eq(t.users.role, "HR_HEAD"), isNull(t.users.erasedAt)));
      hrs.forEach((a) => recipients.set(a.id, a));
    }
    if (input.action === "reject") kind = "course_rejected";
    if (decision.publication === "PUBLISHED") {
      kind = "course_published";
      approvers.forEach((a) => recipients.set(a.id, a));
    }
    for (const recipient of recipients.values()) {
      const role = canonicalRole(recipient.role);
      if (!role) continue;
      await notify(
        recipient.id,
        kind,
        {
          courseId: course.id,
          courseTitle: course.title,
          comment: input.comment.trim(),
          state: decision.state,
          href: courseWorkspacePath(
            { id: recipient.id, role, departmentId: recipient.departmentId },
            course.id,
          ),
        },
        `workflow:${input.requestId}:${recipient.id}`,
        undefined,
        { connection: tx, afterCommit },
      );
    }
  });
  await Promise.allSettled(afterCommit.map((deliver) => deliver()));
}
