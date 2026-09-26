import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";

export type LearningTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LearningDatabase = typeof db | LearningTransaction;

/** Serialize renewal creation and completion for one learner/course. */
export async function lockLearningCourse(tx: LearningTransaction, userId: string, courseId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`learning:${userId}:${courseId}`}, 0))`);
}

/** Only explicit renewal starts a fresh cycle. Other assignments retain learning. */
export async function currentCycleStart(userId: string, courseId: string, connection: LearningDatabase = db): Promise<Date | null> {
  const [renewal] = await connection.select({ startedAt: t.enrollments.createdAt }).from(t.enrollments)
    .where(and(eq(t.enrollments.userId, userId), eq(t.enrollments.courseId, courseId), eq(t.enrollments.source, "recert")))
    .orderBy(desc(t.enrollments.createdAt)).limit(1);
  return renewal?.startedAt ?? null;
}

export async function lessonCourseId(lessonId: string): Promise<string | null> {
  const [row] = await db.select({ courseId: t.modules.courseId }).from(t.lessons)
    .innerJoin(t.modules, eq(t.lessons.moduleId, t.modules.id)).where(eq(t.lessons.id, lessonId)).limit(1);
  return row?.courseId ?? null;
}

/** Fetch boundaries together for outlines containing several oral-check lessons. */
export async function cycleStartsByCourse(userId: string, courseIds: string[]) {
  if (!courseIds.length) return new Map<string, Date>();
  const rows = await db.select().from(t.enrollments)
    .where(and(eq(t.enrollments.userId, userId), eq(t.enrollments.source, "recert"), inArray(t.enrollments.courseId, courseIds)))
    .orderBy(desc(t.enrollments.createdAt));
  const starts = new Map<string, Date>();
  for (const row of rows) if (!starts.has(row.courseId)) starts.set(row.courseId, row.createdAt);
  return starts;
}
