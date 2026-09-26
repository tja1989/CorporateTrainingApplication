import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { scoreQuiz, scoreQuestion, shuffleChoices, type Answer } from "./scoring";
import { gradeFreeText, gradeRouting } from "./grading";
import { markLessonComplete, awardPoints, awardBadge, recordActivityDay } from "@/lib/lms/completion";
import { notify } from "@/lib/notify";
import { currentCycleStart, lessonCourseId } from "@/lib/lms/learning-cycle";
import type { QuizSettings, ServedItem } from "@/lib/db/schema";

type Quiz = typeof t.quizzes.$inferSelect;
type Question = typeof t.questions.$inferSelect;
type Attempt = typeof t.attempts.$inferSelect;

export const DEFAULT_SETTINGS: QuizSettings = {
  attemptsLimit: null,
  cooldownMinutes: 0,
  gradingMethod: "highest",
  passPct: 70,
  shuffleQuestions: true,
  shuffleChoices: true,
  oneAtATime: false,
  noBacktrack: false,
  feedbackMode: "PRACTICE",
  graceSec: 30,
  integrityMode: false,
  timeLimitSec: null,
};

export function windowState(s: QuizSettings, now = new Date()): "before" | "open" | "closed" {
  if (s.availableFrom && now < new Date(s.availableFrom)) return "before";
  if (s.availableUntil && now > new Date(s.availableUntil)) return "closed";
  return "open";
}

/** EXAM answers reveal only after window close or explicit release (spec FR-6.6). */
export function canRevealAnswers(s: QuizSettings, now = new Date()): boolean {
  if (s.feedbackMode === "PRACTICE") return true;
  if (s.answersReleasedAt && now >= new Date(s.answersReleasedAt)) return true;
  if (s.availableUntil && now > new Date(s.availableUntil)) return true;
  return false;
}

/** Current allowance and result exclude historical sittings from prior renewals. */
export async function currentQuizAttempts(quiz: Pick<Quiz, "id" | "lessonId">, userId: string) {
  const rows = await db.select().from(t.attempts)
    .where(and(eq(t.attempts.quizId, quiz.id), eq(t.attempts.userId, userId))).orderBy(desc(t.attempts.startedAt));
  const lessonId = await attachedLessonId(quiz);
  const courseId = lessonId ? await lessonCourseId(lessonId) : null;
  const cycle = courseId ? await currentCycleStart(userId, courseId) : null;
  return cycle ? rows.filter(row => row.startedAt >= cycle) : rows;
}

async function attachedLessonId(quiz: Pick<Quiz, "id" | "lessonId">) {
  if (quiz.lessonId) return quiz.lessonId;
  const [lesson] = await db.select({ id: t.lessons.id }).from(t.lessons)
    .where(sql`${t.lessons.payload}->>'quizId' = ${quiz.id}`).limit(1);
  return lesson?.id ?? null;
}

export async function canStart(
  quiz: Quiz,
  userId: string,
  now = new Date(),
): Promise<{ ok: true; resume?: Attempt } | { ok: false; reason: string }> {
  const s = quiz.settings;
  const ws = windowState(s, now);
  if (ws === "before") return { ok: false, reason: `This assessment opens ${new Date(s.availableFrom!).toLocaleString()}.` };
  if (ws === "closed") return { ok: false, reason: "This assessment window has closed." };

  const previous = await currentQuizAttempts(quiz, userId);

  const open = previous.find((a) => a.state === "IN_PROGRESS");
  if (open) return { ok: true, resume: open };

  // VOIDED attempts never count toward the limit (spec FR-7.3)
  const counted = previous.filter((a) => a.state !== "VOIDED");
  if (s.attemptsLimit !== null && counted.length >= s.attemptsLimit) {
    return { ok: false, reason: "You have used all attempts for this assessment." };
  }
  if (s.cooldownMinutes > 0 && counted[0]?.submittedAt) {
    const readyAt = new Date(counted[0].submittedAt.getTime() + s.cooldownMinutes * 60_000);
    if (now < readyAt) return { ok: false, reason: `Next attempt available at ${readyAt.toLocaleTimeString()}.` };
  }
  return { ok: true };
}

async function composeServedItems(quiz: Quiz): Promise<ServedItem[]> {
  const questionIds: string[] = [];
  for (const section of quiz.sections) {
    if (section.fixed) questionIds.push(...section.fixed);
    else if (section.bankId && section.pickN) {
      const bankQuestions = await db
        .select({ id: t.questions.id })
        .from(t.questions)
        .where(and(eq(t.questions.bankId, section.bankId), eq(t.questions.status, "APPROVED")));
      const pool = bankQuestions.map((q) => q.id).filter((qid) => !questionIds.includes(qid));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      questionIds.push(...pool.slice(0, section.pickN));
    }
  }
  const questionRows = questionIds.length
    ? await db.select().from(t.questions).where(inArray(t.questions.id, questionIds))
    : [];
  const byId = new Map(questionRows.map((q) => [q.id, q]));

  let ordered = [...questionIds];
  if (quiz.settings.shuffleQuestions) {
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
  }
  const served: ServedItem[] = [];
  for (let order = 0; order < ordered.length; order++) {
    const q = byId.get(ordered[order]);
    if (!q) continue;
    let choiceOrder: number[] | undefined;
    if (quiz.settings.shuffleChoices) {
      if (q.type === "mcq_single" || q.type === "mcq_multi") {
        choiceOrder = shuffleChoices(q.body.options?.length ?? 0, q.body.lockedOptionIndices ?? []);
      } else if (q.type === "matching") {
        choiceOrder = shuffleChoices(q.body.pairs?.length ?? 0);
      } else if (q.type === "ordering") {
        choiceOrder = shuffleChoices(q.body.orderItems?.length ?? 0);
      }
    }
    served.push({ questionId: q.id, order, choiceOrder });
  }
  return served;
}

export async function startAttempt(quiz: Quiz, user: { id: string; timeMultiplier: number }): Promise<Attempt> {
  const check = await canStart(quiz, user.id);
  if (!check.ok) throw new Error(check.reason);
  if (check.resume) return check.resume;

  const servedItems = await composeServedItems(quiz);
  if (servedItems.length === 0) throw new Error("This quiz has no questions yet.");
  const timeLimit = quiz.settings.timeLimitSec ? Math.round(quiz.settings.timeLimitSec * (user.timeMultiplier || 1)) : null;
  const attempt: typeof t.attempts.$inferInsert = {
    id: id(),
    quizId: quiz.id,
    userId: user.id,
    servedItems,
    answers: {},
    deadlineAt: timeLimit ? new Date(Date.now() + timeLimit * 1000) : null,
    state: "IN_PROGRESS",
    gradingState: "FINAL",
    integrityMode: quiz.settings.integrityMode,
  };
  await db.insert(t.attempts).values(attempt);
  const [row] = await db.select().from(t.attempts).where(eq(t.attempts.id, attempt.id!)).limit(1);
  return row;
}

export function pastDeadline(attempt: Attempt, graceSec: number, now = new Date()): boolean {
  return !!attempt.deadlineAt && now.getTime() > attempt.deadlineAt.getTime() + graceSec * 1000;
}

export async function saveAnswers(attempt: Attempt, quiz: Quiz, answers: Record<string, Answer>): Promise<void> {
  if (attempt.state !== "IN_PROGRESS") throw new Error("Attempt is not open");
  if (pastDeadline(attempt, quiz.settings.graceSec)) {
    await submitAttempt(attempt.id, { auto: true });
    throw new Error("Time is up — your saved answers were submitted.");
  }
  await db
    .update(t.attempts)
    .set({ answers: { ...attempt.answers, ...answers } })
    .where(eq(t.attempts.id, attempt.id));
}

/** Map displayed-index answers back to actual indices using the served choiceOrder. */
export function unmapAnswer(q: Question, served: ServedItem, answer: Answer | undefined): Answer | undefined {
  if (!answer || !served.choiceOrder) return answer;
  const co = served.choiceOrder;
  if (answer.kind === "choice") return { kind: "choice", selected: answer.selected.map((dp) => co[dp] ?? dp) };
  if (answer.kind === "matching") {
    const mapped: Record<number, number> = {};
    for (const [left, dp] of Object.entries(answer.pairs)) mapped[Number(left)] = co[dp] ?? dp;
    return { kind: "matching", pairs: mapped };
  }
  if (answer.kind === "ordering") return { kind: "ordering", order: answer.order.map((dp) => co[dp] ?? dp) };
  return answer;
}

async function quizGatesRequiredCompletion(quiz: Quiz): Promise<{ lessonId: string | null; courseId: string | null; required: boolean }> {
  const lessonId = await attachedLessonId(quiz);
  if (!lessonId) return { lessonId: null, courseId: null, required: false };
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson) return { lessonId: null, courseId: null, required: false };
  const [mod] = await db.select().from(t.modules).where(eq(t.modules.id, lesson.moduleId)).limit(1);
  return { lessonId: lesson.id, courseId: mod?.courseId ?? null, required: true };
}

export async function submitAttempt(attemptId: string, opts: { auto?: boolean } = {}): Promise<Attempt> {
  const [attempt] = await db.select().from(t.attempts).where(eq(t.attempts.id, attemptId)).limit(1);
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.state !== "IN_PROGRESS") return attempt;
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, attempt.quizId)).limit(1);
  if (!quiz) throw new Error("Quiz not found");

  const questionRows = await db
    .select()
    .from(t.questions)
    .where(inArray(t.questions.id, attempt.servedItems.map((s) => s.questionId)));
  const byId = new Map(questionRows.map((q) => [q.id, q]));
  const gate = await quizGatesRequiredCompletion(quiz);

  // 1) objective scoring
  const items = attempt.servedItems.map((served) => {
    const q = byId.get(served.questionId)!;
    const rawAnswer = (attempt.answers as Record<string, Answer>)[served.questionId];
    return { questionId: served.questionId, q: { type: q.type, points: q.points, body: q.body }, answer: unmapAnswer(q, served, rawAnswer) };
  });

  // 2) free-text grading (AI + routing)
  let needsHuman = false;
  let minConfidence = 1;
  const freeTextEarned = new Map<string, number>();
  for (const item of items) {
    if (item.q.type !== "free_text") continue;
    const q = byId.get(item.questionId)!;
    const answerText = item.answer?.kind === "text" ? item.answer.text : "";
    if (!q.rubric || !answerText.trim()) {
      freeTextEarned.set(item.questionId, 0);
      continue;
    }
    const grade = await gradeFreeText({
      question: q.body.prompt,
      rubric: q.rubric,
      answer: answerText,
      questionPoints: q.points,
    });
    freeTextEarned.set(item.questionId, grade.earned);
    minConfidence = Math.min(minConfidence, grade.confidence);
    await db.insert(t.gradingReviews).values({
      id: id(),
      attemptId: attempt.id,
      questionId: item.questionId,
      aiScores: grade.scores,
      aiRationale: grade.rationale,
      aiConfidence: grade.confidence,
      reason: "low_conf", // provisional; final reason set below
      state: "PENDING",
      modelVersion: grade.modelVersion,
      promptVersion: grade.promptVersion,
    });
  }

  const score = scoreQuiz(items.map((i) => ({ ...i, freeTextEarned: freeTextEarned.get(i.questionId) ?? null })));
  const passed = score.pct >= quiz.settings.passPct;
  const hasFreeText = items.some((i) => i.q.type === "free_text");

  let gradingState: "PROVISIONAL" | "FINAL" = "FINAL";
  if (hasFreeText) {
    const routing = gradeRouting({
      finalPct: score.pct,
      passPct: quiz.settings.passPct,
      confidence: minConfidence,
      gatesRequiredCompletion: gate.required,
    });
    if (!routing.finalize) {
      needsHuman = true;
      gradingState = "PROVISIONAL";
      await db
        .update(t.gradingReviews)
        .set({ reason: routing.reason ?? "low_conf" })
        .where(and(eq(t.gradingReviews.attemptId, attempt.id), eq(t.gradingReviews.state, "PENDING")));
    } else {
      // confident clear pass → auto-finalize the reviews as confirmed-by-AI
      await db
        .update(t.gradingReviews)
        .set({ state: "CONFIRMED" })
        .where(and(eq(t.gradingReviews.attemptId, attempt.id), eq(t.gradingReviews.state, "PENDING")));
    }
  }

  await db
    .update(t.attempts)
    .set({
      state: needsHuman ? "SUBMITTED" : "GRADED",
      submittedAt: new Date(),
      score: score.earned,
      maxScore: score.possible,
      passed,
      gradingState,
      voidReason: opts.auto ? "auto-submitted at deadline" : null,
    })
    .where(eq(t.attempts.id, attempt.id));

  await recordActivityDay(attempt.userId);

  // Completion + rewards only on FINAL grades (spec FR-6.10)
  if (gradingState === "FINAL" && passed && gate.lessonId) {
    await awardPoints(attempt.userId, "quiz_pass", quiz.id, 20);
    if (score.pct === 100) await awardBadge(attempt.userId, "perfect_quiz");
    await markLessonComplete(attempt.userId, gate.lessonId, attempt.startedAt);
  }
  await notify(attempt.userId, "quiz_graded", {
    quizId: quiz.id,
    quizTitle: quiz.title,
    state: gradingState,
    outcome: `${Math.round(score.pct)}%${gradingState === "PROVISIONAL" ? " (pending confirmation)" : passed ? " — passed" : " — not passed"}`,
  });

  const [updated] = await db.select().from(t.attempts).where(eq(t.attempts.id, attempt.id)).limit(1);
  return updated;
}

/** Reviewer confirm/adjust (spec §11.13); also used for appeals. */
export async function finalizeReview(reviewId: string, reviewerId: string, finalScores: Array<{ criterion: string; points: number; max: number }> | null): Promise<void> {
  const [review] = await db.select().from(t.gradingReviews).where(eq(t.gradingReviews.id, reviewId)).limit(1);
  if (!review || review.state !== "PENDING") return;
  await db
    .update(t.gradingReviews)
    .set({ state: finalScores ? "ADJUSTED" : "CONFIRMED", reviewerId, finalScores: finalScores ?? review.aiScores })
    .where(eq(t.gradingReviews.id, reviewId));

  // If no pending reviews remain on the attempt, finalize it.
  const pending = await db
    .select()
    .from(t.gradingReviews)
    .where(and(eq(t.gradingReviews.attemptId, review.attemptId), eq(t.gradingReviews.state, "PENDING")));
  if (pending.length > 0) return;

  const [attempt] = await db.select().from(t.attempts).where(eq(t.attempts.id, review.attemptId)).limit(1);
  if (!attempt) return;
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, attempt.quizId)).limit(1);
  if (!quiz) return;
  const questionRows = await db
    .select()
    .from(t.questions)
    .where(inArray(t.questions.id, attempt.servedItems.map((s) => s.questionId)));
  const byId = new Map(questionRows.map((q) => [q.id, q]));
  // An appeal appends a new decision; the latest review for each question is
  // authoritative while all earlier decisions stay available for audit.
  const reviews = await db.select().from(t.gradingReviews).where(eq(t.gradingReviews.attemptId, attempt.id))
    .orderBy(desc(t.gradingReviews.createdAt));

  const items = attempt.servedItems.map((served) => {
    const q = byId.get(served.questionId)!;
    const rawAnswer = (attempt.answers as Record<string, Answer>)[served.questionId];
    let freeTextEarned: number | null = null;
    if (q.type === "free_text") {
      const r = reviews.find((rv) => rv.questionId === q.id);
      const scores = r?.finalScores ?? r?.aiScores ?? [];
      const rubricMax = (q.rubric?.criteria ?? []).reduce((s, c) => s + c.points, 0) || 1;
      freeTextEarned = (scores.reduce((s, c) => s + c.points, 0) / rubricMax) * q.points;
    }
    return { questionId: served.questionId, q: { type: q.type, points: q.points, body: q.body }, answer: unmapAnswer(q, served, rawAnswer), freeTextEarned };
  });
  const score = scoreQuiz(items);
  const passed = score.pct >= quiz.settings.passPct;
  await db
    .update(t.attempts)
    .set({ score: score.earned, maxScore: score.possible, passed, gradingState: "FINAL", state: "GRADED" })
    .where(eq(t.attempts.id, attempt.id));

  const gate = await quizGatesRequiredCompletion(quiz);
  if (passed && gate.lessonId) {
    await awardPoints(attempt.userId, "quiz_pass", quiz.id, 20);
    if (score.pct === 100) await awardBadge(attempt.userId, "perfect_quiz");
    await markLessonComplete(attempt.userId, gate.lessonId, attempt.startedAt);
  }
  await notify(attempt.userId, "quiz_graded", {
    quizId: quiz.id,
    quizTitle: quiz.title,
    state: "FINAL",
    outcome: `${Math.round(score.pct)}%${passed ? " — passed" : " — not passed"}`,
  });
}
