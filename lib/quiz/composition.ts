import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { QuizSection, QuizSettings } from "@/lib/db/schema";
import type { Actor } from "@/lib/auth/roles";
import { canReadCourse, type CourseOwnership } from "@/lib/courses/ownership";
import type { LearningDatabase, LearningTransaction } from "@/lib/lms/learning-cycle";
import type { QuestionSearchRow } from "@/lib/questions/search";
import { liveExamQuestionIds } from "@/lib/questions/usage";

/** A quiz's content: picked questions in order, plus random draws from banks. */
export type QuizContent = { picked: string[]; draws: { bankId: string; pickN: number }[] };
export type PickerQuestion = {
  id: string;
  bankId: string;
  bankName: string;
  type: string;
  prompt: string;
  points: number;
  liveExam: boolean;
};

/** Picked questions first, as one fixed section, then one section per draw. */
export function toSections(c: QuizContent): QuizSection[] {
  return [
    ...(c.picked.length ? [{ fixed: [...c.picked] }] : []),
    ...c.draws.map(({ bankId, pickN }) => ({ bankId, pickN })),
  ];
}

/** Reads sections as the attempt engine serves them: a section with a fixed
 * list serves that list, otherwise a bank and a count draw at random. */
export function fromSections(sections: QuizSection[]): QuizContent {
  const content: QuizContent = { picked: [], draws: [] };
  for (const section of sections) {
    if (section.fixed) content.picked.push(...section.fixed);
    else if (section.bankId && section.pickN)
      content.draws.push({ bankId: section.bankId, pickN: section.pickN });
  }
  return content;
}

const text = (value: FormDataEntryValue) => (typeof value === "string" ? value.trim() : "");
const wholeNumber = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);

/** Repeated `picked` ids, and paired repeated `drawBank` + `drawCount` rows.
 * A row with neither a bank nor a count is dropped. */
export function parseQuizContent(form: FormData): QuizContent {
  const picked = form.getAll("picked").map(text).filter(Boolean);
  const banks = form.getAll("drawBank").map(text);
  const counts = form.getAll("drawCount").map(text);
  const draws: QuizContent["draws"] = [];
  for (let i = 0; i < Math.max(banks.length, counts.length); i++) {
    const bankId = banks[i] ?? "";
    const count = counts[i] ?? "";
    if (bankId || count) draws.push({ bankId, pickN: wholeNumber(count) });
  }
  return { picked, draws };
}

/** Throws the first problem an author must fix before the quiz can be saved.
 * A draw may ask for more than its bank holds: learners get what exists. */
export async function assertQuizContent(
  tx: LearningTransaction,
  c: QuizContent,
): Promise<void> {
  if (c.picked.length === 0 && c.draws.reduce((sum, d) => sum + d.pickN, 0) === 0)
    throw new Error("Add at least one question.");
  if (new Set(c.picked).size !== c.picked.length)
    throw new Error("Each question can appear only once.");
  if (c.picked.length > 0) {
    const approved = await tx
      .select({ id: t.questions.id })
      .from(t.questions)
      .where(and(inArray(t.questions.id, c.picked), eq(t.questions.status, "APPROVED")));
    if (approved.length !== c.picked.length)
      throw new Error(
        "One or more picked questions are no longer available. Remove them and save again.",
      );
  }
  if (c.draws.some((d) => !Number.isInteger(d.pickN) || d.pickN < 1 || d.pickN > 100))
    throw new Error("Random questions must be a whole number from 1 to 100.");
  const bankIds = [...new Set(c.draws.map((d) => d.bankId))];
  if (bankIds.length > 0) {
    const banks = bankIds.includes("")
      ? []
      : await tx
          .select({ id: t.questionBanks.id })
          .from(t.questionBanks)
          .where(inArray(t.questionBanks.id, bankIds));
    if (banks.length !== bankIds.length)
      throw new Error("Choose a question bank for each random draw.");
  }
}

/** The two settings the quiz form controls. */
export function quizModes(form: FormData): Pick<QuizSettings, "feedbackMode" | "integrityMode"> {
  return {
    feedbackMode: form.get("exam") === "on" ? "EXAM" : "PRACTICE",
    integrityMode: form.get("integrity") === "on",
  };
}

/** Parses and checks a quiz form inside the curriculum transaction. A
 * practice quiz that picks a question a live exam uses needs
 * `confirmLiveExam=on`, because its learners see answers right away. */
export async function composeQuizSections(
  tx: LearningTransaction,
  form: FormData,
): Promise<QuizSection[]> {
  const content = parseQuizContent(form);
  await assertQuizContent(tx, content);
  if (
    quizModes(form).feedbackMode === "PRACTICE" &&
    form.get("confirmLiveExam") !== "on" &&
    content.picked.length > 0 &&
    (await liveExamQuestionIds(content.picked, tx)).size > 0
  )
    throw new Error("Confirm that learners will see answers to questions used in a live exam.");
  return toSections(content);
}

/** Picker rows, each marked when a live exam uses it. */
export async function toPickerQuestions(
  rows: Pick<QuestionSearchRow, "id" | "bankId" | "bankName" | "type" | "body" | "points">[],
  conn: LearningDatabase = db,
): Promise<PickerQuestion[]> {
  const live = await liveExamQuestionIds(rows.map((r) => r.id), conn);
  return rows.map((r) => ({
    id: r.id,
    bankId: r.bankId,
    bankName: r.bankName ?? "",
    type: r.type,
    prompt: r.body.prompt,
    points: r.points,
    liveExam: live.has(r.id),
  }));
}

/** Picker rows for these question ids, in the same order, whatever their
 * status. Ids with no question are left out. */
export async function pickerQuestions(
  ids: string[],
  conn: LearningDatabase = db,
): Promise<PickerQuestion[]> {
  if (ids.length === 0) return [];
  const rows = await conn
    .select({ question: t.questions, bankName: t.questionBanks.name })
    .from(t.questions)
    .leftJoin(t.questionBanks, eq(t.questionBanks.id, t.questions.bankId))
    .where(inArray(t.questions.id, ids));
  const byId = new Map(rows.map((r) => [r.question.id, { ...r.question, bankName: r.bankName }]));
  return toPickerQuestions(
    ids.flatMap((id) => byId.get(id) ?? []),
    conn,
  );
}

/** Authors may copy from any course they can read, and from any published course. */
const canCopyFrom = (actor: Actor, course: CourseOwnership & { status: string }) =>
  canReadCourse(actor, course) || course.status === "PUBLISHED";

export async function quizCopySources(
  actor: Actor,
): Promise<{ lessonId: string; label: string }[]> {
  const rows = await db
    .select({
      lessonId: t.lessons.id,
      quizTitle: t.quizzes.title,
      courseTitle: t.courses.title,
      status: t.courses.status,
      instructorId: t.courses.instructorId,
      departmentId: t.courses.departmentId,
    })
    .from(t.lessons)
    .innerJoin(t.modules, eq(t.modules.id, t.lessons.moduleId))
    .innerJoin(t.courses, eq(t.courses.id, t.modules.courseId))
    .innerJoin(t.quizzes, sql`${t.lessons.payload}->>'quizId'=${t.quizzes.id}`)
    .where(eq(t.lessons.type, "QUIZ"))
    .orderBy(asc(t.courses.title), asc(t.modules.sort), asc(t.lessons.sort));
  return rows
    .filter((row) => canCopyFrom(actor, row))
    .map((row) => ({ lessonId: row.lessonId, label: `${row.courseTitle} — ${row.quizTitle}` }));
}

/** A quiz's APPROVED picked questions, in order, and its random draws, or
 * null when the actor may not copy it. */
export async function quizContentToCopy(
  actor: Actor,
  lessonId: string,
): Promise<{ content: QuizContent; questions: PickerQuestion[] } | null> {
  const [source] = await db
    .select({ lesson: t.lessons, course: t.courses })
    .from(t.lessons)
    .innerJoin(t.modules, eq(t.modules.id, t.lessons.moduleId))
    .innerJoin(t.courses, eq(t.courses.id, t.modules.courseId))
    .where(eq(t.lessons.id, lessonId))
    .limit(1);
  const quizId = source?.lesson.payload.quizId;
  if (!source || source.lesson.type !== "QUIZ" || !quizId || !canCopyFrom(actor, source.course))
    return null;
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, quizId)).limit(1);
  if (!quiz) return null;
  const { picked, draws } = fromSections(quiz.sections);
  const unique = [...new Set(picked)];
  const approved = unique.length
    ? await db
        .select({ id: t.questions.id })
        .from(t.questions)
        .where(and(inArray(t.questions.id, unique), eq(t.questions.status, "APPROVED")))
    : [];
  const approvedIds = new Set(approved.map((q) => q.id));
  const kept = unique.filter((id) => approvedIds.has(id));
  return { content: { picked: kept, draws }, questions: await pickerQuestions(kept) };
}
