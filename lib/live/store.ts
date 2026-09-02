import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { notify } from "@/lib/notify";
import { markLessonComplete } from "@/lib/lms/completion";
import { courseOutline } from "@/lib/lms/queries";
import type { InterviewConfig, LiveEvaluation, LiveTurn } from "@/lib/db/schema";
import { CONTENT_CHAR_CAP, fallbackEvaluate, interviewContentFor, parseInterviewConfig, pickScopeLessons, scoreEvaluation, type InterviewContent } from "./interview";

/** Persistence for oral checks (spec FR-14.2 v1.4): post-lesson checks and INTERVIEW lessons. */

export type Interview = typeof t.liveInterviews.$inferSelect;

export async function createInterview(opts: {
  userId: string;
  lessonId: string;
  courseId: string;
  model: string;
  mock: boolean;
  questionCount: number;
  maxMinutes: number;
  passPct: number;
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

type LessonRow = typeof t.lessons.$inferSelect;

/** Interviewable text of one VIDEO (READY transcript) or TEXT lesson. */
async function lessonContent(lesson: LessonRow): Promise<InterviewContent | null> {
  if (lesson.type === "VIDEO" && lesson.payload.videoId) {
    const [video] = await db.select().from(t.videos).where(eq(t.videos.id, lesson.payload.videoId)).limit(1);
    const chunks = video
      ? await db.select({ text: t.videoChunks.text }).from(t.videoChunks).where(eq(t.videoChunks.videoId, video.id)).orderBy(t.videoChunks.startSec)
      : [];
    return interviewContentFor(lesson, video ?? null, chunks);
  }
  return interviewContentFor(lesson);
}

export type LoadedLesson = {
  lesson: LessonRow;
  course: typeof t.courses.$inferSelect;
  outline: Awaited<ReturnType<typeof courseOutline>>;
  /** Present for INTERVIEW lessons only. */
  config: InterviewConfig | null;
  content: InterviewContent | null;
};

/**
 * Lesson + course + the content the interviewer may ask about. INTERVIEW
 * lessons assemble their scope (previous / module / course); VIDEO and TEXT
 * lessons interview on themselves (the post-lesson oral check).
 */
export async function loadLessonContent(lessonId: string): Promise<LoadedLesson | null> {
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson) return null;
  const [mod] = await db.select().from(t.modules).where(eq(t.modules.id, lesson.moduleId)).limit(1);
  if (!mod) return null;
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, mod.courseId)).limit(1);
  if (!course) return null;
  const outline = await courseOutline(course.id);

  if (lesson.type !== "INTERVIEW") {
    return { lesson, course, outline, config: null, content: await lessonContent(lesson) };
  }
  const config = parseInterviewConfig(lesson.payload.interview);
  const byId = new Map(outline.flatMap((o) => o.lessons).map((l) => [l.id, l]));
  const sources = new Set<string>();
  const parts: string[] = [];
  for (const scopedId of pickScopeLessons(outline, lesson.id, config.scope)) {
    const scoped = byId.get(scopedId);
    if (!scoped) continue;
    const c = await lessonContent(scoped);
    if (!c) continue;
    sources.add(c.source);
    parts.push(`## ${scoped.title}\n${c.text}`);
    if (parts.join("\n\n").length >= CONTENT_CHAR_CAP) break;
  }
  const text = parts.join("\n\n").slice(0, CONTENT_CHAR_CAP);
  const content: InterviewContent | null = text.trim()
    ? { title: lesson.title, text, source: sources.size > 1 ? "mixed" : sources.has("video") ? "video" : "text" }
    : null;
  return { lesson, course, outline, config, content };
}

/**
 * Stores the result, notifies the learner (and the manager on a fail), and —
 * for INTERVIEW lessons — completes the lesson on a pass (or on any finish
 * when the admin did not require a pass).
 */
export async function completeInterview(
  interviewId: string,
  evaluation: LiveEvaluation,
  source: "model" | "fallback" | "mock",
): Promise<{ pct: number; outcome: "PASS" | "FAIL" }> {
  const row = await getInterview(interviewId);
  if (!row) throw new Error("Interview not found");
  if (row.state === "COMPLETED") return { pct: row.scorePct ?? 0, outcome: row.outcome ?? "FAIL" };
  const scored = scoreEvaluation(evaluation, row.passPct);
  await db
    .update(t.liveInterviews)
    .set({ evaluation, evaluationSource: source, scorePct: scored.pct, outcome: scored.outcome, state: "COMPLETED", completedAt: new Date() })
    .where(eq(t.liveInterviews.id, interviewId));

  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, row.lessonId)).limit(1);
  const [user] = await db.select().from(t.users).where(eq(t.users.id, row.userId)).limit(1);
  const lessonTitle = lesson?.title ?? "lesson";
  await notify(row.userId, "oral_check_result", { lessonTitle, scorePct: scored.pct, outcome: scored.outcome, interviewId }, `oral:${interviewId}`);
  if (scored.outcome === "FAIL" && user?.managerId) {
    await notify(user.managerId, "oral_check_review", { learnerName: user.name, lessonTitle, scorePct: scored.pct, interviewId }, `oral-review:${interviewId}`);
  }
  if (lesson?.type === "INTERVIEW") {
    const cfg = parseInterviewConfig(lesson.payload.interview);
    if (scored.outcome === "PASS" || !cfg.requirePass) await markLessonComplete(row.userId, row.lessonId);
  }
  return scored;
}

/**
 * Called when the session ends. A transcript with at least one learner answer
 * but no recorded evaluation is graded from the transcript by the fallback;
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
  await completeInterview(interviewId, evaluation, source);
  return getInterview(interviewId);
}

/** An admin overturns a fail: the check counts as passed and an INTERVIEW lesson completes. */
export async function overturnInterview(interviewId: string, reviewerId: string): Promise<void> {
  const row = await getInterview(interviewId);
  if (!row || row.state !== "COMPLETED") return;
  await db
    .update(t.liveInterviews)
    .set({ outcome: "PASS", reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(eq(t.liveInterviews.id, interviewId));
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, row.lessonId)).limit(1);
  if (lesson?.type === "INTERVIEW") await markLessonComplete(row.userId, row.lessonId);
  await notify(
    row.userId,
    "oral_check_result",
    { lessonTitle: lesson?.title ?? "lesson", scorePct: row.scorePct ?? 0, outcome: "PASS", overturned: true, interviewId },
    `oral-overturn:${interviewId}`,
  );
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

/** Failed checks nobody has looked at yet (spec FR-6.10a: a human can confirm or overturn). */
export async function pendingInterviewReviews(limit = 50): Promise<InterviewWithTitles[]> {
  const rows = await db
    .select()
    .from(t.liveInterviews)
    .where(and(eq(t.liveInterviews.outcome, "FAIL"), isNull(t.liveInterviews.reviewedAt)))
    .orderBy(desc(t.liveInterviews.completedAt))
    .limit(limit);
  return withTitles(rows);
}

export async function markInterviewReviewed(interviewId: string, reviewerId: string): Promise<void> {
  await db.update(t.liveInterviews).set({ reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(t.liveInterviews.id, interviewId));
}
