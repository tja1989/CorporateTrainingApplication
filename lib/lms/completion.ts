import { and, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id, certificateSerial } from "@/lib/ids";
import { computeComplianceStatus } from "./compliance";
import { isoWeekStart, localDate } from "@/lib/time";
import { notify } from "@/lib/notify";
import { currentCycleStart, lessonCourseId, lockLearningCourse, type LearningDatabase, type LearningWriteContext } from "./learning-cycle";

/** Award points once per (kind, refId) per user. */
export async function awardPoints(userId: string, kind: string, refId: string, amount: number, connection: LearningDatabase = db): Promise<void> {
  const existing = await connection
    .select({ id: t.pointsLedger.id })
    .from(t.pointsLedger)
    .where(and(eq(t.pointsLedger.userId, userId), eq(t.pointsLedger.kind, kind), eq(t.pointsLedger.refId, refId)))
    .limit(1);
  if (existing.length > 0) return;
  await connection.insert(t.pointsLedger).values({ id: id(), userId, kind, refId, amount });
}

export async function awardBadge(userId: string, badge: "first_course" | "five_courses" | "four_week_streak" | "perfect_quiz", connection: LearningDatabase = db) {
  await connection.insert(t.badges).values({ id: id(), userId, badge }).onConflictDoNothing();
}

/** Record learning activity for the weekly-goal streak (3 distinct days / ISO week). */
export async function recordActivityDay(userId: string, connection: LearningDatabase = db): Promise<void> {
  const week = isoWeekStart();
  const today = localDate();
  const [row] = await connection
    .select()
    .from(t.streakState)
    .where(and(eq(t.streakState.userId, userId), eq(t.streakState.weekStart, week)));
  if (!row) {
    // carry streak weeks forward from the latest previous row
    const prev = await connection
      .select()
      .from(t.streakState)
      .where(eq(t.streakState.userId, userId))
      .orderBy(sql`week_start DESC`)
      .limit(1);
    const prevRow = prev[0];
    const prevMet = prevRow ? prevRow.daysActive.length >= 3 : false;
    await connection.insert(t.streakState).values({
      id: id(),
      userId,
      weekStart: week,
      daysActive: [today],
      freezesUsedMonth: 0,
      currentStreakWeeks: prevMet ? (prevRow?.currentStreakWeeks ?? 0) : 0,
    });
    return;
  }
  if (!row.daysActive.includes(today)) {
    const days = [...row.daysActive, today];
    const updates: Partial<typeof t.streakState.$inferInsert> = { daysActive: days };
    if (days.length === 3) {
      updates.currentStreakWeeks = row.currentStreakWeeks + 1;
      if (row.currentStreakWeeks + 1 >= 4) await awardBadge(userId, "four_week_streak", connection);
    }
    await connection.update(t.streakState).set(updates).where(eq(t.streakState.id, row.id));
  }
}

/** Credit inside an existing learning transaction without borrowing another client. */
export async function markLessonCompleteInTransaction(context: LearningWriteContext, userId: string, lessonId: string, courseId: string, evidenceStartedAt?: Date): Promise<boolean> {
  const { connection } = context;
  await lockLearningCourse(connection, userId, courseId);
  const cycle = await currentCycleStart(userId, courseId, connection);
  if (evidenceStartedAt && cycle && evidenceStartedAt < cycle) return false;
  await connection.insert(t.lessonProgress).values({ id: id(), userId, lessonId, status: "COMPLETED" })
    .onConflictDoUpdate({ target: [t.lessonProgress.userId, t.lessonProgress.lessonId], set: { status: "COMPLETED", updatedAt: new Date() } });
  await checkCourseCompletion(userId, courseId, context);
  await awardPoints(userId, "lesson_complete", lessonId, 10, connection);
  await recordActivityDay(userId, connection);
  return true;
}

export async function markLessonComplete(userId: string, lessonId: string, evidenceStartedAt?: Date): Promise<void> {
  const courseId = await lessonCourseId(lessonId);
  if (!courseId) return;
  const afterCommit: LearningWriteContext["afterCommit"] = [];
  await db.transaction(connection => markLessonCompleteInTransaction({ connection, afterCommit }, userId, lessonId, courseId, evidenceStartedAt));
  for (const effect of afterCommit) await effect();
}

/** Course completes when all lessons of all modules complete (spec FR-2.4). */
export async function checkCourseCompletion(userId: string, courseId: string, context?: LearningWriteContext): Promise<boolean> {
  const connection = context?.connection ?? db;
  const mods = await connection.select().from(t.modules).where(eq(t.modules.courseId, courseId));
  if (mods.length === 0) return false;
  const lessonRows = await connection
    .select()
    .from(t.lessons)
    .where(inArray(t.lessons.moduleId, mods.map((m) => m.id)));
  if (lessonRows.length === 0) return false;
  const progress = await connection
    .select()
    .from(t.lessonProgress)
    .where(and(eq(t.lessonProgress.userId, userId), inArray(t.lessonProgress.lessonId, lessonRows.map((l) => l.id))));
  const done = new Set(progress.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId));
  const allDone = lessonRows.every((l) => done.has(l.id));
  if (!allDone) {
    // mark active enrollment in progress
    await connection
      .update(t.enrollments)
      .set({ status: "IN_PROGRESS" })
      .where(and(eq(t.enrollments.userId, userId), eq(t.enrollments.courseId, courseId), eq(t.enrollments.status, "NOT_STARTED")));
    return false;
  }
  await completeCourse(userId, courseId, context);
  return true;
}

export async function completeCourse(userId: string, courseId: string, context?: LearningWriteContext): Promise<void> {
  const connection = context?.connection ?? db;
  const enrollments = await connection
    .select()
    .from(t.enrollments)
    .where(and(eq(t.enrollments.userId, userId), eq(t.enrollments.courseId, courseId)));
  const active = enrollments.find((e) => e.status === "NOT_STARTED" || e.status === "IN_PROGRESS");
  if (!active) return; // already completed or no enrollment

  const now = new Date();
  const [course] = await connection.select().from(t.courses).where(eq(t.courses.id, courseId)).limit(1);

  // Immutable completion record (append-only)
  await connection.insert(t.completionRecords).values({ id: id(), userId, courseId, completedAt: now });

  let certExpiresAt: Date | null = null;
  if (course?.certificateEnabled) {
    certExpiresAt = course.certificateValidityDays
      ? new Date(now.getTime() + course.certificateValidityDays * 24 * 3600_000)
      : null;
    await connection.insert(t.certificates).values({
      id: id(),
      userId,
      courseId,
      kind: "internal",
      issuedAt: now,
      expiresAt: certExpiresAt,
      serial: certificateSerial(),
    });
  }

  await connection
    .update(t.enrollments)
    .set({
      status: "COMPLETED",
      completedAt: now,
      complianceStatus: computeComplianceStatus({ status: "COMPLETED", dueAt: active.dueAt, certificateExpiresAt: certExpiresAt }),
    })
    .where(eq(t.enrollments.id, active.id));

  await awardPoints(userId, "course_complete", courseId, 50, connection);
  const [countRow] = await connection
    .select({ n: sql<number>`count(*)::int` })
    .from(t.completionRecords)
    .where(eq(t.completionRecords.userId, userId));
  const completions = countRow?.n ?? 0;
  if (completions >= 1) await awardBadge(userId, "first_course", connection);
  if (completions >= 5) await awardBadge(userId, "five_courses", connection);

  await notify(userId, "course_completed", { courseId, courseTitle: course?.title ?? "Course" }, undefined, undefined, context);
}
