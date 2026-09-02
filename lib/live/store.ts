import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { notify } from "@/lib/notify";
import type { LiveEvaluation, LiveTurn } from "@/lib/db/schema";
import { fallbackEvaluate, interviewContentFor, scoreEvaluation, type InterviewContent } from "./interview";

/** Persistence for oral checks (spec FR-14.2). */

export type Interview = typeof t.liveInterviews.$inferSelect;

export async function createInterview(opts: {
  userId: string;
  lessonId: string;
  courseId: string;
  model: string;
  mock: boolean;
  questionCount: number;
  maxMinutes: number;
}): Promise<string> {
  const interviewId = id();
  await db.insert(t.liveInterviews).values({ id: interviewId, ...opts });
  return interviewId;
}

export async function getInterview(interviewId: string): Promise<Interview | null> {
  const [row] = await db.select().from(t.liveInterviews).where(eq(t.liveInterviews.id, interviewId)).limit(1);
  return row ?? null;
}

/** Appends transcript turns in one statement (jsonb concatenation). */
export async function appendInterviewTurns(interviewId: string, turns: LiveTurn[]): Promise<void> {
  if (turns.length === 0) return;
  const clean: LiveTurn[] = turns.map((x) => ({ role: x.role, text: x.text.slice(0, 4000), at: x.at ?? new Date().toISOString(), ...(x.mock ? { mock: true } : {}) }));
  await db
    .update(t.liveInterviews)
    .set({ transcript: sql`coalesce(${t.liveInterviews.transcript}, '[]'::jsonb) || ${JSON.stringify(clean)}::jsonb` })
    .where(eq(t.liveInterviews.id, interviewId));
}

/** Lesson + course + interviewable content for an interview. */
export async function loadLessonContent(lessonId: string): Promise<{
  lesson: typeof t.lessons.$inferSelect;
  course: typeof t.courses.$inferSelect;
  content: InterviewContent | null;
} | null> {
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson) return null;
  const [mod] = await db.select().from(t.modules).where(eq(t.modules.id, lesson.moduleId)).limit(1);
  if (!mod) return null;
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, mod.courseId)).limit(1);
  if (!course) return null;
  let content: InterviewContent | null = null;
  if (lesson.type === "VIDEO" && lesson.payload.videoId) {
    const [video] = await db.select().from(t.videos).where(eq(t.videos.id, lesson.payload.videoId)).limit(1);
    const chunks = video
      ? await db.select({ text: t.videoChunks.text }).from(t.videoChunks).where(eq(t.videoChunks.videoId, video.id)).orderBy(t.videoChunks.startSec)
      : [];
    content = interviewContentFor(lesson, video ?? null, chunks);
  } else {
    content = interviewContentFor(lesson);
  }
  return { lesson, course, content };
}

/** Stores the result, notifies the learner, and routes NEEDS_REVIEW to the manager. */
export async function completeInterview(
  interviewId: string,
  evaluation: LiveEvaluation,
  source: "model" | "fallback" | "mock",
  opts: { forceReview?: boolean } = {},
): Promise<{ pct: number; outcome: "PASS" | "NEEDS_REVIEW" }> {
  const row = await getInterview(interviewId);
  if (!row) throw new Error("Interview not found");
  if (row.state === "COMPLETED") return { pct: row.scorePct ?? 0, outcome: row.outcome ?? "NEEDS_REVIEW" };
  const scored = scoreEvaluation(evaluation);
  const outcome = opts.forceReview ? "NEEDS_REVIEW" : scored.outcome;
  await db
    .update(t.liveInterviews)
    .set({ evaluation, evaluationSource: source, scorePct: scored.pct, outcome, state: "COMPLETED", completedAt: new Date() })
    .where(eq(t.liveInterviews.id, interviewId));

  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, row.lessonId)).limit(1);
  const [user] = await db.select().from(t.users).where(eq(t.users.id, row.userId)).limit(1);
  const lessonTitle = lesson?.title ?? "lesson";
  await notify(row.userId, "oral_check_result", { lessonTitle, scorePct: scored.pct, outcome, interviewId }, `oral:${interviewId}`);
  if (outcome === "NEEDS_REVIEW" && user?.managerId) {
    await notify(user.managerId, "oral_check_review", { learnerName: user.name, lessonTitle, scorePct: scored.pct, interviewId }, `oral-review:${interviewId}`);
  }
  return { pct: scored.pct, outcome };
}

/**
 * Called when the session ends. A transcript with at least one learner answer
 * but no recorded evaluation is graded by the fallback and flagged for review;
 * an empty one is marked abandoned.
 */
export async function finishInterview(interviewId: string): Promise<Interview | null> {
  const row = await getInterview(interviewId);
  if (!row || row.state !== "IN_PROGRESS") return row;
  const answered = row.transcript.some((x) => x.role === "user" && x.text.trim().length > 0);
  if (!answered) {
    await db.update(t.liveInterviews).set({ state: "ABANDONED", completedAt: new Date() }).where(eq(t.liveInterviews.id, interviewId));
    return getInterview(interviewId);
  }
  const loaded = await loadLessonContent(row.lessonId);
  const content = loaded?.content ?? { title: "lesson", text: "", source: "text" as const };
  const { evaluation, source } = await fallbackEvaluate(row.transcript, content);
  await completeInterview(interviewId, evaluation, source, { forceReview: true });
  return getInterview(interviewId);
}

/** Latest interview per lesson for a learner (completed rows win over abandoned ones). */
export async function latestInterviewsByLesson(userId: string, lessonIds: string[]): Promise<Map<string, Interview>> {
  if (lessonIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(t.liveInterviews)
    .where(and(eq(t.liveInterviews.userId, userId), inArray(t.liveInterviews.lessonId, lessonIds)))
    .orderBy(desc(t.liveInterviews.startedAt));
  const map = new Map<string, Interview>();
  for (const r of rows) {
    const cur = map.get(r.lessonId);
    if (!cur || (cur.state !== "COMPLETED" && r.state === "COMPLETED")) map.set(r.lessonId, r);
  }
  return map;
}

export type InterviewWithTitles = Interview & { lessonTitle: string; courseTitle: string; learnerName: string };

async function withTitles(rows: Interview[]): Promise<InterviewWithTitles[]> {
  if (rows.length === 0) return [];
  const lessonIds = [...new Set(rows.map((r) => r.lessonId))];
  const courseIds = [...new Set(rows.map((r) => r.courseId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [lessons, courses, users] = await Promise.all([
    db.select({ id: t.lessons.id, title: t.lessons.title }).from(t.lessons).where(inArray(t.lessons.id, lessonIds)),
    db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).where(inArray(t.courses.id, courseIds)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(inArray(t.users.id, userIds)),
  ]);
  const l = new Map(lessons.map((x) => [x.id, x.title]));
  const c = new Map(courses.map((x) => [x.id, x.title]));
  const u = new Map(users.map((x) => [x.id, x.name]));
  return rows.map((r) => ({ ...r, lessonTitle: l.get(r.lessonId) ?? "Lesson", courseTitle: c.get(r.courseId) ?? "Course", learnerName: u.get(r.userId) ?? "Learner" }));
}

export async function interviewsForUser(userId: string, limit = 20): Promise<InterviewWithTitles[]> {
  const rows = await db
    .select()
    .from(t.liveInterviews)
    .where(and(eq(t.liveInterviews.userId, userId), eq(t.liveInterviews.state, "COMPLETED")))
    .orderBy(desc(t.liveInterviews.completedAt))
    .limit(limit);
  return withTitles(rows);
}

export async function pendingInterviewReviews(limit = 50): Promise<InterviewWithTitles[]> {
  const rows = await db
    .select()
    .from(t.liveInterviews)
    .where(and(eq(t.liveInterviews.outcome, "NEEDS_REVIEW"), isNull(t.liveInterviews.reviewedAt)))
    .orderBy(desc(t.liveInterviews.completedAt))
    .limit(limit);
  return withTitles(rows);
}

export async function markInterviewReviewed(interviewId: string, reviewerId: string): Promise<void> {
  await db.update(t.liveInterviews).set({ reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(t.liveInterviews.id, interviewId));
}
