import { eq, inArray } from "drizzle-orm";
import { t } from "@/lib/db/client";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";
import {
  assertAcyclicPrerequisites,
  normalizeFolderPath,
  type ParsedCoursePlanning,
} from "./planning";
import { isCourseAvailable } from "./availability";

/** Caller holds the curriculum lock and enforces draft ownership/revision via mutateDraftCourse. */
export async function saveCoursePlanning(
  tx: LearningTransaction,
  courseId: string,
  input: ParsedCoursePlanning,
): Promise<void> {
  const old = await tx
    .select()
    .from(t.coursePrerequisites)
    .where(eq(t.coursePrerequisites.courseId, courseId));
  const oldIds = new Set(old.map((row) => row.requiredCourseId));
  const required = input.prerequisiteIds.length
    ? await tx
        .select()
        .from(t.courses)
        .where(inArray(t.courses.id, input.prerequisiteIds))
    : [];
  if (required.length !== input.prerequisiteIds.length)
    throw new Error("A prerequisite course was not found.");
  if (required.some((row) => !oldIds.has(row.id) && !isCourseAvailable(row)))
    throw new Error("New prerequisite courses must be published and approved.");
  const edges = await tx.select().from(t.coursePrerequisites);
  assertAcyclicPrerequisites(courseId, input.prerequisiteIds, edges);
  await tx
    .update(t.courses)
    .set({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      folderPath: normalizeFolderPath(input.folderPath),
    })
    .where(eq(t.courses.id, courseId));
  await tx
    .delete(t.coursePrerequisites)
    .where(eq(t.coursePrerequisites.courseId, courseId));
  if (input.prerequisiteIds.length)
    await tx
      .insert(t.coursePrerequisites)
      .values(
        input.prerequisiteIds.map((requiredCourseId) => ({
          courseId,
          requiredCourseId,
        })),
      );
}

export async function validateCoursePlanning(
  tx: LearningTransaction,
  courseId: string,
): Promise<void> {
  const [course] = await tx
    .select()
    .from(t.courses)
    .where(eq(t.courses.id, courseId))
    .limit(1);
  if (!course) throw new Error("Course not found.");
  if (course.startsAt && course.endsAt && course.endsAt < course.startsAt)
    throw new Error("The course end date cannot precede its start date.");
  normalizeFolderPath(course.folderPath);
  const edges = await tx.select().from(t.coursePrerequisites);
  const ids = edges
    .filter((row) => row.courseId === courseId)
    .map((row) => row.requiredCourseId);
  assertAcyclicPrerequisites(courseId, ids, edges);
  const required = ids.length
    ? await tx.select().from(t.courses).where(inArray(t.courses.id, ids))
    : [];
  if (
    required.length !== ids.length ||
    required.some((row) => !isCourseAvailable(row))
  )
    throw new Error(
      "Every prerequisite must be published and approved before submitting or publishing this course.",
    );
}
