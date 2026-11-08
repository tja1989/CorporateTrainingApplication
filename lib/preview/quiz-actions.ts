"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { canReadCourse } from "@/lib/courses/ownership";
import type { QuizSettings, ServedItem } from "@/lib/db/schema";
import type { Served } from "@/components/question-input";
import { composeServedItems } from "@/lib/quiz/engine";
import { toServed } from "@/lib/quiz/served";
import type { Answer } from "@/lib/quiz/scoring";
import { previewScore, type PreviewResult, type PreviewResultItem } from "./score";

export type PreviewStart = {
  servedItems: ServedItem[];
  served: Served[];
  settings: Pick<QuizSettings, "oneAtATime" | "noBacktrack" | "passPct" | "timeLimitSec" | "feedbackMode" | "integrityMode" | "attemptsLimit" | "cooldownMinutes">;
};
export type { PreviewResult, PreviewResultItem };

const NOT_AVAILABLE = { error: "Preview is not available." } as const;
const MISMATCH = { error: "This preview no longer matches the quiz. Start again." } as const;

/** The actor comes from the session, never the client. Null means "not available". */
async function loadPreviewQuiz(courseId: string, lessonId: string) {
  const actor = await requireUser();
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId)).limit(1);
  if (!course || !canReadCourse(actor, course)) return null;
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson || lesson.type !== "QUIZ" || !lesson.payload.quizId) return null;
  const [mod] = await db.select().from(t.modules).where(eq(t.modules.id, lesson.moduleId)).limit(1);
  if (!mod || mod.courseId !== courseId) return null;
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, lesson.payload.quizId)).limit(1);
  return quiz ?? null;
}

export async function startPreviewQuizAction(courseId: string, lessonId: string): Promise<{ error?: string; start?: PreviewStart }> {
  const quiz = await loadPreviewQuiz(courseId, lessonId);
  if (!quiz) return NOT_AVAILABLE;
  const servedItems = await composeServedItems(quiz, db);
  if (!servedItems.length) return { error: "This quiz has no questions yet." };
  const rows = await db.select().from(t.questions).where(inArray(t.questions.id, servedItems.map((s) => s.questionId)));
  const byId = new Map(rows.map((q) => [q.id, q]));
  const s = quiz.settings;
  return {
    start: {
      servedItems,
      served: servedItems.map((item) => toServed(byId.get(item.questionId)!, item)),
      settings: {
        oneAtATime: s.oneAtATime,
        noBacktrack: s.noBacktrack,
        passPct: s.passPct,
        timeLimitSec: s.timeLimitSec ?? null,
        feedbackMode: s.feedbackMode,
        integrityMode: s.integrityMode,
        attemptsLimit: s.attemptsLimit,
        cooldownMinutes: s.cooldownMinutes,
      },
    },
  };
}

export async function submitPreviewQuizAction(
  courseId: string,
  lessonId: string,
  servedItems: ServedItem[],
  answers: Record<string, Answer>,
): Promise<{ error?: string; result?: PreviewResult }> {
  const quiz = await loadPreviewQuiz(courseId, lessonId);
  if (!quiz) return NOT_AVAILABLE;
  if (!Array.isArray(servedItems) || !servedItems.length) return MISMATCH;

  const ids = servedItems.map((s) => s?.questionId);
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) return MISMATCH;

  const rows = await db.select().from(t.questions).where(inArray(t.questions.id, ids));
  const byId = new Map(rows.map((q) => [q.id, q]));
  const fixed = new Set(quiz.sections.flatMap((sec) => sec.fixed ?? []));
  const drawBanks = new Set(quiz.sections.filter((sec) => !sec.fixed && sec.bankId && sec.pickN).map((sec) => sec.bankId!));
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) return MISMATCH;
    if (!fixed.has(id) && !(q.status === "APPROVED" && drawBanks.has(q.bankId))) return MISMATCH;
  }

  const ordered = [...servedItems].sort((a, b) => a.order - b.order);
  const scored = previewScore(
    ordered.map((served) => ({ q: byId.get(served.questionId)!, served, answer: answers?.[served.questionId] })),
    quiz.settings.passPct,
  );
  return {
    result: {
      earned: scored.earned,
      possible: scored.possible,
      pct: scored.pct,
      passed: scored.passed,
      passPct: quiz.settings.passPct,
      writtenCount: scored.writtenCount,
      items: ordered.map((served) => {
        const q = byId.get(served.questionId)!;
        return { questionId: q.id, type: q.type, prompt: q.body.prompt, points: q.points, earned: scored.earnedById.get(q.id) ?? null, body: q.body, rubric: q.rubric ?? null };
      }),
    },
  };
}
