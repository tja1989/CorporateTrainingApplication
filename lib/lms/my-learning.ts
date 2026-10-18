import { and, desc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { myCourses, type CourseWithProgress } from "@/lib/lms/queries";
import { buildCourseOutline } from "@/lib/lms/course-outline";
import { coursePlanningAccess } from "@/lib/lms/planning-access";
import { pathPrerequisite } from "@/lib/lms/path-access";
import { flatLessons, type OutlineLesson } from "@/lib/lms/outline";

export type InProgressCourse = CourseWithProgress & {
  next: OutlineLesson | null;
  /** Why the course cannot be opened yet (earlier path course or prerequisite). */
  blockedMessage: string | null;
};
export type CompletedCourse = {
  course: { id: string; title: string };
  completedAt: Date;
  completionId: string;
  rated: boolean;
  certificateId: string | null;
};
export type EarnedCertificate = {
  id: string;
  courseId: string;
  courseTitle: string;
  issuedAt: Date;
  expiresAt: Date | null;
};

/** The learner's own training, grouped the way the My courses tabs show it. */
export async function myLearningBoard(userId: string) {
  const mine = await myCourses(userId);
  const [planning, pathLocks, completions, certificates] = await Promise.all([
    Promise.all(mine.map((c) => coursePlanningAccess(userId, c.course.id))),
    Promise.all(mine.map((c) => pathPrerequisite(userId, c.course.id))),
    db
      .select()
      .from(t.completionRecords)
      .where(eq(t.completionRecords.userId, userId))
      .orderBy(desc(t.completionRecords.completedAt), desc(t.completionRecords.id)),
    db
      .select({ cert: t.certificates, courseTitle: t.courses.title })
      .from(t.certificates)
      .innerJoin(t.courses, eq(t.courses.id, t.certificates.courseId))
      .where(eq(t.certificates.userId, userId))
      .orderBy(desc(t.certificates.issuedAt)),
  ]);

  const open = mine.filter(
    (c, i) =>
      c.enrollment?.status !== "COMPLETED" &&
      !(planning[i].blocked && planning[i].reason === "scheduled"),
  );
  const outlines = await Promise.all(
    open.map((c) =>
      buildCourseOutline({ courseId: c.course.id, userId, sequentialLock: c.course.sequentialLock }),
    ),
  );
  const inProgress: InProgressCourse[] = open
    .map((c, i) => {
      const index = mine.indexOf(c);
      const access = planning[index];
      const path = pathLocks[index];
      return {
        ...c,
        next: flatLessons(outlines[i]).find((l) => l.id === outlines[i].nextLessonId) ?? null,
        blockedMessage: path
          ? `Complete the earlier courses in “${path.title}” first.`
          : access.blocked
            ? access.message
            : null,
      };
    })
    // Started courses first, then the rest in assignment order.
    .sort((a, b) => Number(b.enrollment?.status === "IN_PROGRESS") - Number(a.enrollment?.status === "IN_PROGRESS"));

  // Learning history: each course's latest completion, even while a renewal is under way.
  const latestCompletion = new Map<string, (typeof completions)[number]>();
  for (const record of completions)
    if (!latestCompletion.has(record.courseId)) latestCompletion.set(record.courseId, record);
  const finishedCourses = latestCompletion.size
    ? await db
        .select({ id: t.courses.id, title: t.courses.title })
        .from(t.courses)
        .where(inArray(t.courses.id, [...latestCompletion.keys()]))
    : [];
  const completionIds = [...latestCompletion.values()].map((r) => r.id);
  const ratings = completionIds.length
    ? await db
        .select({ completionId: t.courseFeedback.completionRecordId })
        .from(t.courseFeedback)
        .where(
          and(
            eq(t.courseFeedback.employeeId, userId),
            inArray(t.courseFeedback.completionRecordId, completionIds),
          ),
        )
    : [];
  const rated = new Set(ratings.map((r) => r.completionId));
  const completed: CompletedCourse[] = finishedCourses
    .map((course) => {
      const record = latestCompletion.get(course.id)!;
      return {
        course,
        completedAt: record.completedAt,
        completionId: record.id,
        rated: rated.has(record.id),
        certificateId: certificates.find((row) => row.cert.courseId === course.id)?.cert.id ?? null,
      };
    })
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  const earned: EarnedCertificate[] = certificates.map(({ cert, courseTitle }) => ({
    id: cert.id,
    courseId: cert.courseId,
    courseTitle,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
  }));

  return { inProgress, completed, certificates: earned };
}
