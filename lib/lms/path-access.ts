import type { LearningDatabase } from "./learning-cycle";
import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { courseProgress } from "./queries";
import { firstIncompletePrerequisite } from "./path-rules";

/** Restrict an explicitly assigned ordered path, without adding an enrollment
 * requirement to unrelated published courses or relocking historical completions. */
export async function pathPrerequisite(userId: string, courseId: string, connection: LearningDatabase = db) {
  const enrollments = await connection.select().from(t.enrollments).where(and(
    eq(t.enrollments.userId, userId), eq(t.enrollments.courseId, courseId),
    inArray(t.enrollments.source, ["path", "rule"]), inArray(t.enrollments.status, ["NOT_STARTED", "IN_PROGRESS"]),
  ));
  const ruleIds = [...new Set(enrollments.filter(e => e.source === "rule").map(e => e.sourceId).filter((id): id is string => !!id))];
  const rules = ruleIds.length ? await connection.select().from(t.enrollmentRules).where(and(inArray(t.enrollmentRules.id, ruleIds), eq(t.enrollmentRules.targetType, "path"), eq(t.enrollmentRules.active, true))) : [];
  const pathIds = [...new Set([
    ...enrollments.filter(e => e.source === "path").map(e => e.sourceId).filter((id): id is string => !!id),
    ...rules.map(rule => rule.targetId),
  ])];
  if (!pathIds.length) return null;
  const paths = await connection.select().from(t.paths).where(and(inArray(t.paths.id, pathIds), eq(t.paths.completeInOrder, true)));
  if (!paths.length) return null;
  const links = await connection.select().from(t.pathCourses).where(inArray(t.pathCourses.pathId, paths.map(p => p.id)));
  const progress = await courseProgress(userId, [...new Set(links.map(link => link.courseId))], connection);
  for (const path of paths) {
    const prerequisiteId = firstIncompletePrerequisite(links.filter(link => link.pathId === path.id), courseId, progress);
    if (prerequisiteId) return { pathId: path.id, title: path.title, prerequisiteId };
  }
  return null;
}
