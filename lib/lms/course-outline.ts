import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { courseOutline } from "@/lib/lms/queries";
import { latestInterviewsByLesson } from "@/lib/live/store";
import { decorateOutline, type CourseOutlineView, type LessonType, type OralResult } from "@/lib/lms/outline";

/**
 * The one place that assembles a course outline for a learner: structure,
 * progress, durations and oral-check results in a single pass. Both the course
 * page and the lesson page read from here, so they can never disagree.
 *
 * It lives apart from `queries.ts` because it reaches into `lib/live/store`,
 * which already imports `queries.ts` — a helper there would close the cycle.
 */
export async function buildCourseOutline(opts: {
  courseId: string;
  userId: string;
  sequentialLock: boolean;
  currentLessonId?: string | null;
  expandAll?: boolean;
}): Promise<CourseOutlineView> {
  const outline = await courseOutline(opts.courseId);
  const lessons = outline.flatMap((o) => o.lessons);
  const lessonIds = lessons.map((l) => l.id);
  if (lessonIds.length === 0) {
    return decorateOutline({
      courseId: opts.courseId,
      modules: outline.map((o) => o.module),
      lessons: [],
      doneLessonIds: [],
      sequentialLock: opts.sequentialLock,
      currentLessonId: opts.currentLessonId,
      expandAll: opts.expandAll,
    });
  }

  const videoIds = [...new Set(lessons.map((l) => l.payload.videoId).filter((v): v is string => !!v))];
  const quizIds = [...new Set(lessons.map((l) => l.payload.quizId).filter((v): v is string => !!v))];
  // Oral checks attach to video and article lessons as well as INTERVIEW lessons.
  const oralLessonIds = lessons.filter((l) => l.type === "VIDEO" || l.type === "TEXT" || l.type === "INTERVIEW").map((l) => l.id);

  const [progress, videos, quizzes, oralRows] = await Promise.all([
    db
      .select()
      .from(t.lessonProgress)
      .where(and(eq(t.lessonProgress.userId, opts.userId), inArray(t.lessonProgress.lessonId, lessonIds))),
    videoIds.length
      ? db.select({ id: t.videos.id, durationSec: t.videos.durationSec }).from(t.videos).where(inArray(t.videos.id, videoIds))
      : Promise.resolve([]),
    quizIds.length
      ? db.select({ id: t.quizzes.id, settings: t.quizzes.settings }).from(t.quizzes).where(inArray(t.quizzes.id, quizIds))
      : Promise.resolve([]),
    latestInterviewsByLesson(opts.userId, oralLessonIds),
  ]);

  const oral = new Map<string, OralResult>();
  for (const [lessonId, row] of oralRows) {
    oral.set(lessonId, { state: row.state, outcome: row.outcome, scorePct: row.scorePct });
  }

  return decorateOutline({
    courseId: opts.courseId,
    modules: outline.map((o) => o.module),
    lessons: lessons.map((l) => ({
      id: l.id,
      moduleId: l.moduleId,
      type: l.type as LessonType,
      title: l.title,
      sort: l.sort,
      payload: l.payload,
    })),
    doneLessonIds: progress.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId),
    sequentialLock: opts.sequentialLock,
    currentLessonId: opts.currentLessonId,
    expandAll: opts.expandAll,
    videoSec: new Map(videos.map((v) => [v.id, v.durationSec])),
    quizSec: new Map(quizzes.map((q) => [q.id, q.settings?.timeLimitSec ?? null])),
    oral,
  });
}
