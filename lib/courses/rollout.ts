import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { canonicalRole, type Actor } from "@/lib/auth/roles";
import { hasPermission } from "@/lib/auth/permissions";
import { enrollUser } from "@/lib/lms/rules";
import { endOfDayInTz } from "@/lib/time";
import { notify } from "@/lib/notify";
import { lockAssessmentCurriculum, lockCurriculum } from "./workflow";
import type { LearningDatabase } from "@/lib/lms/learning-cycle";
export type RolloutInput = {
  target: { type: "course" | "path"; id: string };
  audience: { type: "employee" | "department" | "group"; id: string };
  dueDays: number;
};
export async function availableTraining(
  target: RolloutInput["target"],
  connection: LearningDatabase = db,
) {
  let courseIds: string[];
  let title: string;
  if (target.type === "course") {
    const [course] = await connection
      .select()
      .from(t.courses)
      .where(eq(t.courses.id, target.id))
      .limit(1);
    if (!course) throw new Error("Course not found.");
    courseIds = [course.id];
    title = course.title;
  } else if (target.type === "path") {
    const [path] = await connection
      .select()
      .from(t.paths)
      .where(eq(t.paths.id, target.id))
      .limit(1);
    if (!path) throw new Error("Path not found.");
    courseIds = (
      await connection
        .select()
        .from(t.pathCourses)
        .where(eq(t.pathCourses.pathId, path.id))
    ).map((p) => p.courseId);
    title = path.title;
  } else throw new Error("Choose a course or learning path.");
  if (!courseIds.length)
    throw new Error("This learning path has no available courses.");
  const courses = await connection
    .select()
    .from(t.courses)
    .where(inArray(t.courses.id, courseIds));
  if (
    courses.length !== new Set(courseIds).size ||
    courses.some(
      (c) =>
        c.status !== "PUBLISHED" ||
        !(
          c.approvalState === "LEGACY_PUBLISHED" ||
          (c.approvalState === "APPROVED" &&
            c.approvedRevision === c.contentRevision)
        ),
    )
  )
    throw new Error(
      "Every target course must be published and approved before rollout.",
    );
  return { courseIds: [...new Set(courseIds)].sort(), title };
}
export async function rolloutTraining(
  actor: Actor,
  input: RolloutInput,
): Promise<{ enrolled: number; alreadyAssigned: number }> {
  if (!hasPermission(actor.role, "course.rollout"))
    throw new Error("Not authorized to roll out training.");
  if (
    !Number.isInteger(input.dueDays) ||
    input.dueDays < 1 ||
    input.dueDays > 3650
  )
    throw new Error("Due days must be a whole number from 1 to 3650.");
  const afterCommit: Array<() => Promise<void>> = [];
  const result = await db.transaction(async (tx) => {
    await lockAssessmentCurriculum(tx);
    const [current] = await tx
      .select()
      .from(t.users)
      .where(eq(t.users.id, actor.id))
      .limit(1);
    if (
      !current ||
      current.erasedAt ||
      current.passwordState !== "ACTIVE" ||
      canonicalRole(current.role) !== actor.role
    )
      throw new Error("Your account access changed. Sign in again.");
    const department = current.departmentId;
    if (
      actor.role === "DEPARTMENT_HEAD" &&
      (!department ||
        (input.audience.type === "department" &&
          input.audience.id !== department))
    )
      throw new Error("This audience is outside your department.");
    const target = await availableTraining(input.target, tx);
    for (const courseId of target.courseIds) await lockCurriculum(tx, courseId);
    if (input.audience.type === "department") {
      const [exists] = await tx
        .select()
        .from(t.departments)
        .where(eq(t.departments.id, input.audience.id))
        .limit(1);
      if (!exists) throw new Error("Department not found.");
    }
    if (input.audience.type === "group") {
      const [exists] = await tx
        .select()
        .from(t.groups)
        .where(eq(t.groups.id, input.audience.id))
        .limit(1);
      if (!exists) throw new Error("Group not found.");
    }
    const audience =
      input.audience.type === "employee"
        ? eq(t.users.id, input.audience.id)
        : input.audience.type === "department"
          ? eq(t.users.departmentId, input.audience.id)
          : input.audience.type === "group"
            ? sql`${t.users.groupIds} @> ${JSON.stringify([input.audience.id])}::jsonb`
            : sql`false`;
    const people = await tx
      .select()
      .from(t.users)
      .where(
        and(
          audience,
          eq(t.users.role, "LEARNER"),
          eq(t.users.passwordState, "ACTIVE"),
          isNull(t.users.erasedAt),
          actor.role === "DEPARTMENT_HEAD"
            ? eq(t.users.departmentId, department!)
            : undefined,
        ),
      )
      .orderBy(t.users.id);
    if (input.audience.type === "employee" && !people.length)
      throw new Error(
        "This employee is inactive or outside your permitted audience.",
      );
    let enrolled = 0,
      alreadyAssigned = 0;
    for (const person of people) {
      const [store] = person.storeId
        ? await tx
            .select()
            .from(t.orgUnits)
            .where(eq(t.orgUnits.id, person.storeId))
            .limit(1)
        : [];
      const n = await enrollUser(
        person.id,
        input.target,
        "manual",
        actor.id,
        endOfDayInTz(input.dueDays, store?.timezone ?? "Asia/Dubai"),
        tx,
      );
      if (n) {
        enrolled += n;
        await notify(
          person.id,
          "enrolled",
          {
            courseTitle: target.title,
            ...(input.target.type === "course"
              ? { courseId: input.target.id }
              : { pathId: input.target.id }),
          },
          undefined,
          undefined,
          { connection: tx, afterCommit },
        );
      } else alreadyAssigned++;
    }
    return { enrolled, alreadyAssigned };
  });
  await Promise.allSettled(afterCommit.map((deliver) => deliver()));
  return result;
}
