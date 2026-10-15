import { and, eq, inArray } from "drizzle-orm";
import { t } from "@/lib/db/client";
import type {
  LearningTransaction,
  LearningDatabase,
} from "@/lib/lms/learning-cycle";
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
  await assertOrderedPathCompatibility(
    tx,
    [
      ...edges.filter((edge) => edge.courseId !== courseId),
      ...input.prerequisiteIds.map((requiredCourseId) => ({
        courseId,
        requiredCourseId,
      })),
    ],
    undefined,
    courseId,
  );
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
    await tx.insert(t.coursePrerequisites).values(
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
  await assertOrderedPathCompatibility(tx, edges, undefined, courseId);
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

/** A later ordered step also depends on the earlier step; both systems must agree. */
export async function assertOrderedPathCompatibility(
  connection: LearningDatabase,
  edges?: { courseId: string; requiredCourseId: string }[],
  pathIds?: string[],
  focusCourseId?: string,
  userId?: string,
): Promise<void> {
  const prerequisites =
    edges ?? (await connection.select().from(t.coursePrerequisites));
  const paths = await connection
    .select()
    .from(t.paths)
    .where(eq(t.paths.completeInOrder, true));
  if (!paths.length) return;
  const orderedIds = new Set(paths.map((path) => path.id));
  const participation = await connection
    .select()
    .from(t.enrollments)
    .where(inArray(t.enrollments.status, ["NOT_STARTED", "IN_PROGRESS"]));
  const rules = await connection
    .select()
    .from(t.enrollmentRules)
    .where(
      and(
        eq(t.enrollmentRules.active, true),
        eq(t.enrollmentRules.targetType, "path"),
      ),
    );
  const perUser = new Map<string, Set<string>>();
  for (const enrollment of participation) {
    const pathId =
      enrollment.source === "path"
        ? enrollment.sourceId
        : enrollment.source === "rule"
          ? rules.find((rule) => rule.id === enrollment.sourceId)?.targetId
          : null;
    if (!pathId || !orderedIds.has(pathId)) continue;
    const assigned = perUser.get(enrollment.userId) ?? new Set<string>();
    assigned.add(pathId);
    perUser.set(enrollment.userId, assigned);
  }
  if (userId) {
    const assigned = perUser.get(userId) ?? new Set<string>();
    for (const pathId of pathIds ?? [])
      if (orderedIds.has(pathId)) assigned.add(pathId);
    perUser.set(userId, assigned);
  }
  const selected = pathIds
    ? paths.filter((path) => pathIds.includes(path.id))
    : paths;
  const groups = [
    ...selected.map((path) => [path.id]),
    ...[...perUser]
      .filter(([person]) => !userId || person === userId)
      .map(([, assigned]) => [...assigned]),
  ];
  const links = await connection
    .select()
    .from(t.pathCourses)
    .where(inArray(t.pathCourses.pathId, [...orderedIds]));
  for (const group of groups) {
    const pathEdges = group.flatMap((pathId) => {
      const ordered = links
        .filter((link) => link.pathId === pathId)
        .sort((a, b) => a.sort - b.sort);
      return ordered
        .slice(1)
        .map((link, index) => ({
          courseId: link.courseId,
          requiredCourseId: ordered[index].courseId,
        }));
    });
    const effective = [...prerequisites, ...pathEdges];
    try {
      const roots = focusCourseId
        ? [focusCourseId]
        : [
            ...new Set(
              pathEdges.flatMap((edge) => [
                edge.courseId,
                edge.requiredCourseId,
              ]),
            ),
          ];
      for (const root of roots)
        assertAcyclicPrerequisites(
          root,
          effective
            .filter((edge) => edge.courseId === root)
            .map((edge) => edge.requiredCourseId),
          effective,
        );
    } catch {
      throw new Error(
        "Course prerequisites conflict with an ordered learning path. Move the prerequisite earlier in the path or remove the conflicting requirement.",
      );
    }
  }
}
