import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, t } from "@/lib/db/client";
import { isCourseAvailable } from "@/lib/courses/availability";
import { courseHasOpened } from "@/lib/courses/planning";
import { formatDateTime } from "@/lib/format";
import type { LearningDatabase } from "./learning-cycle";

export type PlanningCourse = Pick<
  typeof t.courses.$inferSelect,
  | "id"
  | "title"
  | "status"
  | "approvalState"
  | "approvedRevision"
  | "contentRevision"
  | "startsAt"
>;
export type RequiredCourse = { id: string; title: string; available: boolean };
export type CoursePlanningAccess =
  | { blocked: false }
  | {
      blocked: true;
      reason: "scheduled" | "prerequisite" | "unavailable";
      message: string;
      startsAt?: Date;
      requiredCourses?: RequiredCourse[];
    };

export function evaluateCoursePlanningAccess(
  course: PlanningCourse | null,
  required: RequiredCourse[],
  completed: ReadonlySet<string>,
  now = new Date(),
): CoursePlanningAccess {
  if (!course || !isCourseAvailable(course))
    return {
      blocked: true,
      reason: "unavailable",
      message: "This course is not currently published and approved.",
    };
  if (!courseHasOpened(course.startsAt, now))
    return {
      blocked: true,
      reason: "scheduled",
      startsAt: course.startsAt!,
      message: `This course opens ${formatDateTime(course.startsAt!, { now })}.`,
    };
  const missing = required.filter((row) => !completed.has(row.id));
  if (missing.length)
    return {
      blocked: true,
      reason: "prerequisite",
      message:
        "Complete the required prerequisite courses before starting this training.",
      requiredCourses: missing,
    };
  return { blocked: false };
}

export class CoursePlanningBlocked extends Error {
  constructor(public access: Extract<CoursePlanningAccess, { blocked: true }>) {
    super(access.message);
  }
}

export async function coursePlanningAccess(
  userId: string,
  courseId: string,
  connection: LearningDatabase = db,
  now = new Date(),
): Promise<CoursePlanningAccess> {
  const [course] = await connection
    .select()
    .from(t.courses)
    .where(eq(t.courses.id, courseId))
    .limit(1);
  if (
    !course ||
    !isCourseAvailable(course) ||
    !courseHasOpened(course.startsAt, now)
  )
    return evaluateCoursePlanningAccess(course ?? null, [], new Set(), now);
  const required = alias(t.courses, "required_course");
  const dependencies = await connection
    .select({ id: t.coursePrerequisites.requiredCourseId, course: required })
    .from(t.coursePrerequisites)
    .leftJoin(required, eq(required.id, t.coursePrerequisites.requiredCourseId))
    .where(eq(t.coursePrerequisites.courseId, courseId));
  const completionIds = dependencies.length
    ? await connection
        .select({ courseId: t.completionRecords.courseId })
        .from(t.completionRecords)
        .where(
          and(
            eq(t.completionRecords.userId, userId),
            inArray(
              t.completionRecords.courseId,
              dependencies.map((row) => row.id),
            ),
          ),
        )
    : [];
  return evaluateCoursePlanningAccess(
    course,
    dependencies.map((row) => ({
      id: row.id,
      title:
        row.course && isCourseAvailable(row.course)
          ? row.course.title
          : "Unavailable prerequisite",
      available: !!row.course && isCourseAvailable(row.course),
    })),
    new Set(completionIds.map((row) => row.courseId)),
    now,
  );
}

export async function assertCoursePlanningAccess(
  userId: string,
  courseId: string,
  connection: LearningDatabase = db,
): Promise<void> {
  const access = await coursePlanningAccess(userId, courseId, connection);
  if (access.blocked) throw new CoursePlanningBlocked(access);
}
