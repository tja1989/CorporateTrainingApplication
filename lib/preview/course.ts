import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import { canReadCourse, courseWorkspacePath } from "@/lib/courses/ownership";
import { courseOutline } from "@/lib/lms/queries";
import { decorateOutline, type CourseOutlineView, type LessonType } from "@/lib/lms/outline";

export type PreviewCourse = {
  course: typeof t.courses.$inferSelect;
  view: CourseOutlineView;
  lessons: (typeof t.lessons.$inferSelect)[];
  modules: (typeof t.modules.$inferSelect)[];
  prerequisites: { title: string }[];
  backHref: string;
};

export function previewLessonHref(courseId: string, lessonId: string): string {
  return `/preview/course/${courseId}/lesson/${lessonId}`;
}

/** Preview never locks, so say what a real learner would hit. */
export function learnerLockNote(course: { sequentialLock: boolean }, flatIndex: number): string | null {
  return course.sequentialLock && flatIndex > 0 ? "Learners unlock this lesson after completing the previous one." : null;
}

/** A course in any status, for someone who can open it in their workspace. Read-only. */
export async function loadPreviewCourse(actor: CurrentUser, courseId: string): Promise<PreviewCourse | null> {
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId)).limit(1);
  if (!course || !canReadCourse(actor, course)) return null;

  const outline = await courseOutline(courseId);
  const modules = outline.map((o) => o.module);
  const lessons = outline.flatMap((o) => o.lessons);

  const videoIds = [...new Set(lessons.map((l) => l.payload.videoId).filter((v): v is string => !!v))];
  const quizIds = [...new Set(lessons.map((l) => l.payload.quizId).filter((v): v is string => !!v))];
  const [prereqRows, videos, quizzes] = await Promise.all([
    db.select({ requiredCourseId: t.coursePrerequisites.requiredCourseId }).from(t.coursePrerequisites).where(eq(t.coursePrerequisites.courseId, courseId)),
    videoIds.length ? db.select({ id: t.videos.id, durationSec: t.videos.durationSec }).from(t.videos).where(inArray(t.videos.id, videoIds)) : Promise.resolve([]),
    quizIds.length ? db.select({ id: t.quizzes.id, settings: t.quizzes.settings }).from(t.quizzes).where(inArray(t.quizzes.id, quizIds)) : Promise.resolve([]),
  ]);
  const required = prereqRows.length
    ? await db.select({ title: t.courses.title }).from(t.courses).where(inArray(t.courses.id, prereqRows.map((r) => r.requiredCourseId)))
    : [];

  const view = decorateOutline({
    courseId,
    modules,
    lessons: lessons.map((l) => ({ id: l.id, moduleId: l.moduleId, type: l.type as LessonType, title: l.title, sort: l.sort, payload: l.payload })),
    doneLessonIds: [],
    sequentialLock: false,
    hrefFor: (id) => previewLessonHref(courseId, id),
    videoSec: new Map(videos.map((v) => [v.id, v.durationSec])),
    quizSec: new Map(quizzes.map((q) => [q.id, q.settings?.timeLimitSec ?? null])),
  });

  return {
    course,
    view,
    lessons,
    modules,
    prerequisites: required.map((r) => ({ title: r.title })),
    backHref: courseWorkspacePath(actor, courseId),
  };
}
