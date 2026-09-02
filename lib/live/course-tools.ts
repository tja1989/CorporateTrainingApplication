import { inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { myCourses, recommend, type CourseWithProgress } from "@/lib/lms/queries";
import { searchVideoChunks } from "@/lib/retrieval";
import { daysUntil } from "@/lib/time";
import type { LessonCitation } from "@/lib/db/schema";

/**
 * Course-aware tools for the voice assistant (spec FR-14.3 v1.4): the
 * learner's allocated courses only — never the whole catalogue.
 */

export type ScopedLesson = { id: string; title: string; type: string; courseId: string; courseTitle: string; videoId: string | null };

export async function enrolledScope(userId: string): Promise<{ courses: CourseWithProgress[]; lessons: ScopedLesson[] }> {
  const courses = await myCourses(userId);
  const courseIds = courses.map((c) => c.course.id);
  if (courseIds.length === 0) return { courses, lessons: [] };
  const mods = await db.select().from(t.modules).where(inArray(t.modules.courseId, courseIds));
  const modIds = mods.map((m) => m.id);
  const rows = modIds.length ? await db.select().from(t.lessons).where(inArray(t.lessons.moduleId, modIds)) : [];
  const courseOfModule = new Map(mods.map((m) => [m.id, m.courseId]));
  const titleOfCourse = new Map(courses.map((c) => [c.course.id, c.course.title]));
  const lessons: ScopedLesson[] = rows
    .filter((l) => l.type === "VIDEO" || l.type === "TEXT")
    .map((l) => {
      const courseId = courseOfModule.get(l.moduleId) ?? "";
      return { id: l.id, title: l.title, type: l.type, courseId, courseTitle: titleOfCourse.get(courseId) ?? "Course", videoId: l.payload.videoId ?? null };
    });
  return { courses, lessons };
}

/** Full-text search over TEXT lessons using the `lessons_fts` index expression. */
export async function searchLessonText(query: string, lessonIds: string[], topK = 5): Promise<Array<{ id: string; title: string; snippet: string }>> {
  if (lessonIds.length === 0 || !query.trim()) return [];
  const rows = (await db.execute(sql`
    SELECT id, title,
      ts_headline('english', coalesce(search_text, ''), replace(plainto_tsquery('english', ${query})::text, '&', '|')::tsquery, 'MaxFragments=2, MaxWords=70, MinWords=25') AS snippet
    FROM lessons
    WHERE id IN (${sql.join(lessonIds.map((i) => sql`${i}`), sql`, `)})
      AND to_tsvector('english', title || ' ' || coalesce(search_text, '')) @@ replace(plainto_tsquery('english', ${query})::text, '&', '|')::tsquery
    ORDER BY ts_rank_cd(to_tsvector('english', title || ' ' || coalesce(search_text, '')), replace(plainto_tsquery('english', ${query})::text, '&', '|')::tsquery) DESC
    LIMIT ${topK}
  `)) as unknown as { rows: Array<{ id: string; title: string; snippet: string }> };
  return rows.rows.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.snippet.replace(/<\/?b>/g, "").replace(/[*#_`]/g, "").replace(/\s+/g, " ").trim(),
  }));
}

export type CourseExcerpt = { course: string; lesson: string; text: string; href: string };

export async function searchCourseContent(userId: string, query: string, courseTitle?: string): Promise<{ excerpts: CourseExcerpt[]; citations: LessonCitation[] }> {
  const { lessons } = await enrolledScope(userId);
  const wanted = courseTitle?.trim().toLowerCase();
  const scoped = wanted ? lessons.filter((l) => l.courseTitle.toLowerCase().includes(wanted)) : lessons;
  const pool = scoped.length ? scoped : lessons;
  const videoLessons = pool.filter((l) => l.videoId);
  const videoToLesson = new Map(videoLessons.map((l) => [l.videoId as string, l]));
  const byId = new Map(pool.map((l) => [l.id, l]));
  const [videoHits, textHits] = await Promise.all([
    videoLessons.length ? searchVideoChunks(query, { videoIds: videoLessons.map((l) => l.videoId as string) }, 4).catch(() => []) : Promise.resolve([]),
    searchLessonText(query, pool.filter((l) => l.type === "TEXT").map((l) => l.id), 4).catch(() => []),
  ]);
  const excerpts: CourseExcerpt[] = [];
  for (const h of videoHits) {
    const l = videoToLesson.get(h.videoId);
    if (l) excerpts.push({ course: l.courseTitle, lesson: l.title, text: h.text.slice(0, 600), href: `/lesson/${l.id}` });
  }
  for (const h of textHits) {
    const l = byId.get(h.id);
    if (l) excerpts.push({ course: l.courseTitle, lesson: l.title, text: h.snippet.slice(0, 600), href: `/lesson/${l.id}` });
  }
  const citations: LessonCitation[] = [];
  const seen = new Set<string>();
  for (const e of excerpts) {
    if (seen.has(e.href)) continue;
    seen.add(e.href);
    citations.push({ kind: "lesson", title: e.lesson, lessonId: e.href.slice("/lesson/".length), courseTitle: e.course, href: e.href });
    if (citations.length >= 4) break;
  }
  return { excerpts: excerpts.slice(0, 6), citations };
}

const COMPLIANCE_LABEL: Record<string, string> = {
  ON_TRACK: "on track",
  DUE_SOON: "due soon",
  OVERDUE: "overdue",
  COMPLETED: "completed",
  COMPLETED_EXPIRING: "completed, certificate expiring soon",
  EXPIRED: "certificate expired",
  WITHDRAWN: "withdrawn",
};

export type TrainingStatus = {
  summary: string;
  courses: Array<{ title: string; status: string; compliance: string; due: string | null; daysToDue: number | null; pct: number; reason: string | null }>;
};

/** Deterministic status from the same queries the home screen uses. */
export async function trainingStatus(userId: string): Promise<TrainingStatus> {
  const mine = await myCourses(userId);
  const reasons = new Map(recommend(mine).map((r) => [r.course.id, r.reason]));
  const courses = mine.map((c) => {
    const due = c.enrollment?.dueAt ?? null;
    return {
      title: c.course.title,
      status: (c.enrollment?.status ?? "NOT_STARTED").toLowerCase().replace(/_/g, " "),
      compliance: COMPLIANCE_LABEL[c.enrollment?.complianceStatus ?? ""] ?? "on track",
      due: due ? due.toISOString().slice(0, 10) : null,
      daysToDue: due ? daysUntil(due) : null,
      pct: c.pct,
      reason: reasons.get(c.course.id) ?? null,
    };
  });
  const overdue = courses.filter((c) => c.compliance === "overdue").length;
  const dueSoon = courses.filter((c) => c.compliance === "due soon").length;
  const completed = courses.filter((c) => c.status === "completed").length;
  const summary =
    courses.length === 0 ? "No courses are assigned yet." : `${courses.length} course(s) assigned: ${overdue} overdue, ${dueSoon} due soon, ${completed} completed.`;
  return { summary, courses };
}

/** Lines for the assistant's system prompt — first name and role only, never ids or email (FR-13.2). */
export function learnerContextLines(opts: { firstName: string; jobTitle: string | null; storeName: string | null; today: string; status: TrainingStatus }): string {
  const who = [opts.firstName, opts.jobTitle, opts.storeName ? `at ${opts.storeName}` : null].filter(Boolean).join(", ");
  const lines = opts.status.courses.map((c) => {
    const due = c.due ? ` · due ${c.due}${c.daysToDue !== null ? ` (${c.daysToDue < 0 ? `${-c.daysToDue} days overdue` : `${c.daysToDue} days left`})` : ""}` : "";
    return `- ${c.title}: ${c.status}, ${c.compliance}, ${c.pct}% done${due}`;
  });
  return [`Learner: ${who}.`, `Today: ${opts.today}.`, `Assigned courses (${opts.status.courses.length}):`, ...(lines.length ? lines : ["- none yet"])].join("\n");
}
