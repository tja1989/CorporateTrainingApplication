import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";

export type CourseWithProgress = {
  course: typeof t.courses.$inferSelect;
  enrollment: typeof t.enrollments.$inferSelect | null;
  totalLessons: number;
  doneLessons: number;
  pct: number;
};

export async function courseProgress(userId: string, courseIds: string[]): Promise<Map<string, { total: number; done: number }>> {
  const out = new Map<string, { total: number; done: number }>();
  if (courseIds.length === 0) return out;
  const mods = await db.select().from(t.modules).where(inArray(t.modules.courseId, courseIds));
  const modByCourse = new Map<string, string[]>();
  for (const m of mods) {
    modByCourse.set(m.courseId, [...(modByCourse.get(m.courseId) ?? []), m.id]);
  }
  const allModIds = mods.map((m) => m.id);
  const lessonRows = allModIds.length
    ? await db.select().from(t.lessons).where(inArray(t.lessons.moduleId, allModIds))
    : [];
  const lessonIds = lessonRows.map((l) => l.id);
  const progress = lessonIds.length
    ? await db
        .select()
        .from(t.lessonProgress)
        .where(and(eq(t.lessonProgress.userId, userId), inArray(t.lessonProgress.lessonId, lessonIds)))
    : [];
  const doneSet = new Set(progress.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId));
  for (const courseId of courseIds) {
    const modIds = new Set(modByCourse.get(courseId) ?? []);
    const courseLessons = lessonRows.filter((l) => modIds.has(l.moduleId));
    const done = courseLessons.filter((l) => doneSet.has(l.id)).length;
    out.set(courseId, { total: courseLessons.length, done });
  }
  return out;
}

export async function myCourses(userId: string): Promise<CourseWithProgress[]> {
  const enrollments = await db
    .select()
    .from(t.enrollments)
    .where(and(eq(t.enrollments.userId, userId), inArray(t.enrollments.status, ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"])))
    .orderBy(desc(t.enrollments.createdAt));
  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  if (courseIds.length === 0) return [];
  const courses = await db.select().from(t.courses).where(inArray(t.courses.id, courseIds));
  const progress = await courseProgress(userId, courseIds);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: CourseWithProgress[] = [];
  for (const e of enrollments) {
    if (seen.has(e.courseId)) continue;
    seen.add(e.courseId);
    const course = byId.get(e.courseId);
    if (!course || course.status !== "PUBLISHED") continue;
    const p = progress.get(e.courseId) ?? { total: 0, done: 0 };
    out.push({
      course,
      enrollment: e,
      totalLessons: p.total,
      doneLessons: p.done,
      pct: p.total === 0 ? 0 : Math.round((p.done / p.total) * 100),
    });
  }
  return out;
}

/**
 * Honest rule-based recommendations with stated reasons (spec FR-4.2):
 * due-soon > in-progress > new-in-path > popular-in-group. Never labeled AI.
 */
export function recommend(mine: CourseWithProgress[]): Array<CourseWithProgress & { reason: string }> {
  const out: Array<CourseWithProgress & { reason: string }> = [];
  for (const c of mine) {
    if (c.enrollment?.complianceStatus === "OVERDUE") out.push({ ...c, reason: "Overdue — finish this first" });
    else if (c.enrollment?.complianceStatus === "DUE_SOON") out.push({ ...c, reason: "Due soon" });
    else if (c.enrollment?.status === "IN_PROGRESS") out.push({ ...c, reason: `You're ${c.pct}% through — keep going` });
    else if (c.enrollment?.status === "NOT_STARTED" && c.enrollment.source === "path") out.push({ ...c, reason: "Next in your learning path" });
  }
  return out.slice(0, 6);
}

export async function totalPoints(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(amount), 0)::int` })
    .from(t.pointsLedger)
    .where(eq(t.pointsLedger.userId, userId));
  return row?.n ?? 0;
}

export async function courseOutline(courseId: string) {
  const mods = await db.select().from(t.modules).where(eq(t.modules.courseId, courseId));
  mods.sort((a, b) => a.sort - b.sort);
  const lessonRows = mods.length
    ? await db.select().from(t.lessons).where(inArray(t.lessons.moduleId, mods.map((m) => m.id)))
    : [];
  return mods.map((m) => ({
    module: m,
    lessons: lessonRows.filter((l) => l.moduleId === m.id).sort((a, b) => a.sort - b.sort),
  }));
}

/** Sequential-lock check (spec FR-2.1): lesson unlocked iff all prior lessons complete. */
export function isLessonLocked(
  outline: Array<{ module: { id: string }; lessons: Array<{ id: string }> }>,
  doneLessonIds: Set<string>,
  lessonId: string,
  sequentialLock: boolean,
): boolean {
  if (!sequentialLock) return false;
  const flat = outline.flatMap((o) => o.lessons.map((l) => l.id));
  const idx = flat.indexOf(lessonId);
  if (idx <= 0) return false;
  return !flat.slice(0, idx).every((prev) => doneLessonIds.has(prev));
}
