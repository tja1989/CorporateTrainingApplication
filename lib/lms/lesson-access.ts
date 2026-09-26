import { eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { buildCourseOutline } from "./course-outline";
import { pathPrerequisite } from "./path-access";
import { flatLessons } from "./outline";

/** The same published-course and sequential rules feed pages and mutations.
 * Published courses remain open to learners, without introducing enrollment gates. */
export async function learnerLesson(userId: string, lessonId: string) {
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson) return null;
  const [mod] = await db.select().from(t.modules).where(eq(t.modules.id, lesson.moduleId)).limit(1);
  if (!mod) return null;
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, mod.courseId)).limit(1);
  if (!course || course.status !== "PUBLISHED") return null;
  const view = await buildCourseOutline({ courseId: course.id, userId, sequentialLock: course.sequentialLock, currentLessonId: lesson.id });
  const self = flatLessons(view).find(l => l.id === lesson.id);
  if (!self) return null;
  const pathLock = await pathPrerequisite(userId, course.id);
  return { lesson, mod, course, view, self: pathLock ? { ...self, locked: true } : self, pathLock };
}

/** Older quiz records can be linked only through the lesson payload. Standalone
 * quizzes keep their existing access; attached ones share lesson/path rules. */
export async function learnerQuizLesson(userId: string, quiz: { id: string; lessonId: string | null }) {
  let lessonId = quiz.lessonId;
  if (!lessonId) {
    const [lesson] = await db.select({ id: t.lessons.id }).from(t.lessons)
      .where(sql`${t.lessons.payload}->>'quizId' = ${quiz.id}`).limit(1);
    lessonId = lesson?.id ?? null;
  }
  return lessonId ? learnerLesson(userId, lessonId) : undefined;
}
