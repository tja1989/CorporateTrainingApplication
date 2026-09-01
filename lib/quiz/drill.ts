import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { awardPoints, recordActivityDay } from "@/lib/lms/completion";

/**
 * Daily drill (spec FR-6.12/6.13): SM-2-lite spaced repetition over APPROVED
 * questions reachable via quizzes of the learner's enrolled courses. Strictly
 * optional; never counts toward required-training status.
 */

export async function eligibleQuestionIds(userId: string): Promise<string[]> {
  const enrollments = await db
    .select()
    .from(t.enrollments)
    .where(and(eq(t.enrollments.userId, userId), inArray(t.enrollments.status, ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"])));
  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  if (courseIds.length === 0) return [];
  const mods = await db.select().from(t.modules).where(inArray(t.modules.courseId, courseIds));
  if (mods.length === 0) return [];
  const lessonRows = await db.select().from(t.lessons).where(inArray(t.lessons.moduleId, mods.map((m) => m.id)));
  const quizIds = lessonRows.filter((l) => l.type === "QUIZ" && l.payload.quizId).map((l) => l.payload.quizId!);
  if (quizIds.length === 0) return [];
  const quizRows = await db.select().from(t.quizzes).where(inArray(t.quizzes.id, quizIds));
  const ids = new Set<string>();
  const bankIds = new Set<string>();
  for (const quiz of quizRows) {
    for (const section of quiz.sections) {
      section.fixed?.forEach((qid) => ids.add(qid));
      if (section.bankId) bankIds.add(section.bankId);
    }
  }
  if (bankIds.size > 0) {
    const bankQs = await db
      .select({ id: t.questions.id })
      .from(t.questions)
      .where(and(inArray(t.questions.bankId, [...bankIds]), eq(t.questions.status, "APPROVED")));
    bankQs.forEach((q) => ids.add(q.id));
  }
  if (ids.size === 0) return [];
  // keep only APPROVED, non-free-text (drill is instant-feedback)
  const rows = await db
    .select({ id: t.questions.id })
    .from(t.questions)
    .where(and(inArray(t.questions.id, [...ids]), eq(t.questions.status, "APPROVED"), sql`type != 'free_text'`));
  return rows.map((r) => r.id);
}

export async function buildDrillSession(userId: string, size = 6): Promise<Array<typeof t.questions.$inferSelect>> {
  const eligible = await eligibleQuestionIds(userId);
  if (eligible.length === 0) return [];

  const due = await db
    .select()
    .from(t.drillState)
    .where(and(eq(t.drillState.userId, userId), lte(t.drillState.dueAt, new Date()), inArray(t.drillState.questionId, eligible)))
    .orderBy(sql`due_at`)
    .limit(size);

  const dueIds = due.map((d) => d.questionId);
  const picked = [...dueIds];
  if (picked.length < size) {
    // introduce unseen questions
    const seen = await db
      .select({ questionId: t.drillState.questionId })
      .from(t.drillState)
      .where(eq(t.drillState.userId, userId));
    const seenSet = new Set(seen.map((s) => s.questionId));
    const fresh = eligible.filter((qid) => !seenSet.has(qid) && !picked.includes(qid));
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    picked.push(...fresh.slice(0, size - picked.length));
  }
  if (picked.length === 0) return [];
  const rows = await db.select().from(t.questions).where(inArray(t.questions.id, picked));
  const order = new Map(picked.map((qid, i) => [qid, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * SM-2-lite update. "Confidently wrong" (wrong + sure) gets top re-drill
 * priority: due again in 10 minutes with hardest ease penalty.
 */
export async function recordDrillAnswer(
  userId: string,
  questionId: string,
  correct: boolean,
  confidence: "sure" | "unsure" | null,
): Promise<void> {
  const [state] = await db
    .select()
    .from(t.drillState)
    .where(and(eq(t.drillState.userId, userId), eq(t.drillState.questionId, questionId)))
    .limit(1);

  const prev = state ?? { intervalDays: 0, ease: 2.5, streak: 0 };
  let ease = prev.ease;
  let intervalDays: number;
  let streak: number;

  if (correct) {
    streak = prev.streak + 1;
    ease = Math.min(3.0, ease + 0.05);
    intervalDays = streak === 1 ? 1 : streak === 2 ? 3 : Math.round(prev.intervalDays * ease) || 7;
  } else {
    streak = 0;
    const confidentlyWrong = confidence === "sure";
    ease = Math.max(1.3, ease - (confidentlyWrong ? 0.3 : 0.2));
    intervalDays = confidentlyWrong ? 0.007 : 0.02; // ~10 min vs ~30 min
  }

  const dueAt = new Date(Date.now() + intervalDays * 24 * 3600_000);
  if (state) {
    await db
      .update(t.drillState)
      .set({ intervalDays, ease, streak, dueAt, lastConfidence: confidence })
      .where(eq(t.drillState.id, state.id));
  } else {
    await db.insert(t.drillState).values({
      id: id(),
      userId,
      questionId,
      intervalDays,
      ease,
      streak,
      dueAt,
      lastConfidence: confidence,
    });
  }
}

export async function completeDrillSession(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await awardPoints(userId, "drill_session", today, 5);
  await recordActivityDay(userId);
}
