import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { Actor } from "./roles";
export type TrainingScope = { userIds?: string[]; courseIds?: string[] };
export async function trainingScope(actor: Actor): Promise<TrainingScope> {
  if (actor.role === "ADMIN" || actor.role === "HR_HEAD") return {};
  if (actor.role === "DEPARTMENT_HEAD" && actor.departmentId) {
    const people = await db.select({id:t.users.id}).from(t.users)
      .where(and(eq(t.users.departmentId, actor.departmentId), eq(t.users.role, "LEARNER"), isNull(t.users.erasedAt)));
    return {userIds:people.map(person=>person.id)};
  }
  if (actor.role === "INSTRUCTOR") {
    const courses = await db.select({id:t.courses.id}).from(t.courses).where(eq(t.courses.instructorId, actor.id));
    const courseIds = courses.map(course=>course.id);
    if (!courseIds.length) return {userIds:[],courseIds:[]};
    const enrollments = await db.select({userId:t.enrollments.userId}).from(t.enrollments).where(inArray(t.enrollments.courseId,courseIds));
    return {courseIds,userIds:[...new Set(enrollments.map(enrollment=>enrollment.userId))]};
  }
  return {userIds:[],courseIds:[]};
}
