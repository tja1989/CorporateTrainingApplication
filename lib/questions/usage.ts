import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { QuizSection } from "@/lib/db/schema";
import type { LearningDatabase } from "@/lib/lms/learning-cycle";
import type { Actor } from "@/lib/auth/roles";
import { canAuthorCourse } from "@/lib/courses/ownership";
import { isDraftCourse, isLiveCourse, type CourseState } from "./rules";

export type UsageRef = {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  quizTitle: string;
  via: "picked" | "random";
  live: boolean;
  exam: boolean;
};

const picks = (section: QuizSection, questionId: string) =>
  section.fixed?.includes(questionId) ?? false;
/** Only `{ bankId, pickN }` sections draw from a bank. A bank's own
 * `courseId` and picked (`fixed`) questions are not random draws. */
const draws = (section: QuizSection, bankId: string) =>
  section.bankId === bankId && !!section.pickN;

const textArray = (values: string[]) =>
  sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;

/** Quiz lessons, with their course, having a section that matches `match`
 * (`s` is the section). Joined as `updateDraftQuestion` joins them. */
function quizzesWhere(conn: LearningDatabase, match: SQL) {
  return conn
    .select({
      courseId: t.courses.id,
      courseTitle: t.courses.title,
      status: t.courses.status,
      approvalState: t.courses.approvalState,
      lessonId: t.lessons.id,
      quizTitle: t.quizzes.title,
      sections: t.quizzes.sections,
      settings: t.quizzes.settings,
    })
    .from(t.lessons)
    .innerJoin(t.modules, eq(t.modules.id, t.lessons.moduleId))
    .innerJoin(t.courses, eq(t.courses.id, t.modules.courseId))
    .innerJoin(t.quizzes, sql`${t.lessons.payload}->>'quizId'=${t.quizzes.id}`)
    .where(
      sql`EXISTS(SELECT 1 FROM jsonb_array_elements(${t.quizzes.sections}) s WHERE ${match})`,
    );
}

function distinctCourses(
  rows: { courseId: string; courseTitle: string; status: string; approvalState: string }[],
): CourseState[] {
  const courses = new Map<string, CourseState>();
  for (const row of rows)
    courses.set(row.courseId, {
      id: row.courseId,
      title: row.courseTitle,
      status: row.status,
      approvalState: row.approvalState,
    });
  return [...courses.values()];
}

/** Where each question is used: quizzes that pick it, and quizzes that draw
 * randomly from its bank. Every requested id has an entry. */
export async function questionUsage(
  questionIds: string[],
  conn: LearningDatabase = db,
): Promise<Map<string, UsageRef[]>> {
  const usage = new Map<string, UsageRef[]>(questionIds.map((id) => [id, []]));
  if (questionIds.length === 0) return usage;
  const found = await conn
    .select({ id: t.questions.id, bankId: t.questions.bankId })
    .from(t.questions)
    .where(inArray(t.questions.id, questionIds));
  if (found.length === 0) return usage;
  const bankIds = [...new Set(found.map((q) => q.bankId))];
  const rows = await quizzesWhere(
    conn,
    sql`(s->'fixed') ?| ${textArray(questionIds)} OR s->>'bankId' = ANY(${textArray(bankIds)})`,
  );
  for (const row of rows) {
    for (const question of found) {
      const vias = new Set<UsageRef["via"]>();
      for (const section of row.sections) {
        if (picks(section, question.id)) vias.add("picked");
        if (draws(section, question.bankId)) vias.add("random");
      }
      for (const via of vias)
        usage.get(question.id)?.push({
          courseId: row.courseId,
          courseTitle: row.courseTitle,
          lessonId: row.lessonId,
          quizTitle: row.quizTitle,
          via,
          live: isLiveCourse(row),
          exam: row.settings.feedbackMode === "EXAM",
        });
    }
  }
  return usage;
}

/** Courses, in any state, with a quiz that draws randomly from the bank. */
export async function randomDrawCourses(
  bankId: string,
  conn: LearningDatabase = db,
): Promise<CourseState[]> {
  const rows = await quizzesWhere(conn, sql`s->>'bankId' = ${bankId}`);
  return distinctCourses(
    rows.filter((row) => row.sections.some((s) => draws(s, bankId))),
  );
}

/** Courses, in any state, with a quiz that picks the question or draws
 * randomly from its bank. */
export async function referencingCourses(
  question: { id: string; bankId: string },
  conn: LearningDatabase = db,
): Promise<CourseState[]> {
  const rows = await quizzesWhere(
    conn,
    sql`(s->'fixed') ? ${question.id} OR s->>'bankId' = ${question.bankId}`,
  );
  return distinctCourses(
    rows.filter((row) =>
      row.sections.some(
        (s) => picks(s, question.id) || draws(s, question.bankId),
      ),
    ),
  );
}

/** How many attempts, in any state, were served the question. */
export async function servedCount(
  questionId: string,
  conn: LearningDatabase = db,
): Promise<number> {
  const [row] = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(t.attempts)
    .where(
      sql`${t.attempts.servedItems} @> ${JSON.stringify([{ questionId }])}::jsonb`,
    );
  return row?.count ?? 0;
}

/** Questions a live course uses in an exam-mode quiz, picked or drawn. */
export async function liveExamQuestionIds(
  questionIds: string[],
  conn: LearningDatabase = db,
): Promise<Set<string>> {
  const usage = await questionUsage(questionIds, conn);
  return new Set(
    [...usage]
      .filter(([, refs]) => refs.some((ref) => ref.live && ref.exam))
      .map(([questionId]) => questionId),
  );
}

/** Banks holding an APPROVED question that a live course uses in an
 * exam-mode quiz, so a random draw from them can serve that question. */
export async function liveExamBankIds(
  bankIds: string[],
  conn: LearningDatabase = db,
): Promise<Set<string>> {
  if (bankIds.length === 0) return new Set();
  const approved = await conn
    .select({ id: t.questions.id, bankId: t.questions.bankId })
    .from(t.questions)
    .where(and(inArray(t.questions.bankId, bankIds), eq(t.questions.status, "APPROVED")));
  const live = await liveExamQuestionIds(approved.map((q) => q.id), conn);
  return new Set(approved.filter((q) => live.has(q.id)).map((q) => q.bankId));
}

/** The question has no recorded author and its bank belongs to a course the
 * actor authors, so they count as its author (see `canManageQuestion`). */
export async function isCourseTeamQuestion(
  actor: Actor,
  question: { authorId: string | null; bankId: string },
  conn: LearningDatabase = db,
): Promise<boolean> {
  if (question.authorId !== null) return false;
  const [owner] = await conn
    .select({ instructorId: t.courses.instructorId, departmentId: t.courses.departmentId })
    .from(t.questionBanks)
    .innerJoin(t.courses, eq(t.courses.id, t.questionBanks.courseId))
    .where(eq(t.questionBanks.id, question.bankId))
    .limit(1);
  return !!owner && canAuthorCourse(actor, owner);
}

/** Banks whose AI drafts an instructor may approve or discard: at least one
 * course uses the bank in a quiz section or owns it, and every one of them is
 * an unsubmitted draft the instructor teaches. This is the rule
 * `updateDraftQuestion` enforces, so every draft listed can be acted on. */
export async function reviewableDraftBankIds(
  actor: Actor,
  conn: LearningDatabase = db,
): Promise<string[]> {
  if (actor.role !== "INSTRUCTOR") return [];
  const drawing = await conn
    .select({
      instructorId: t.courses.instructorId,
      status: t.courses.status,
      approvalState: t.courses.approvalState,
      sections: t.quizzes.sections,
    })
    .from(t.lessons)
    .innerJoin(t.modules, eq(t.modules.id, t.lessons.moduleId))
    .innerJoin(t.courses, eq(t.courses.id, t.modules.courseId))
    .innerJoin(t.quizzes, sql`${t.lessons.payload}->>'quizId'=${t.quizzes.id}`)
    .where(sql`EXISTS(SELECT 1 FROM jsonb_array_elements(${t.quizzes.sections}) s WHERE s ? 'bankId')`);
  const owning = await conn
    .select({
      bankId: t.questionBanks.id,
      instructorId: t.courses.instructorId,
      status: t.courses.status,
      approvalState: t.courses.approvalState,
    })
    .from(t.questionBanks)
    .innerJoin(t.courses, eq(t.courses.id, t.questionBanks.courseId));
  type Course = { instructorId: string | null; status: string; approvalState: string };
  const users = new Map<string, Course[]>();
  const add = (bankId: string, course: Course) =>
    users.set(bankId, [...(users.get(bankId) ?? []), course]);
  for (const row of drawing)
    for (const section of row.sections) if (section.bankId) add(section.bankId, row);
  for (const row of owning) add(row.bankId, row);
  return [...users]
    .filter(([, courses]) => courses.every((c) => c.instructorId === actor.id && isDraftCourse(c)))
    .map(([bankId]) => bankId);
}
