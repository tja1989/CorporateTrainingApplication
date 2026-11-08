"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, t } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/guard";
import type { Permission } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/roles";
import type { ActionResult } from "@/components/workspace-form";
import { canReadCourse } from "@/lib/courses/ownership";
import { mutateDraftCourse } from "@/lib/courses/workflow";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";
import { createQuestion } from "@/lib/questions/bank";
import { MAX_SEARCH_PAGE, searchApprovedQuestions, searchPage } from "@/lib/questions/search";
import { parseQuestionForm } from "@/lib/questions/validate";
import {
  composeQuizSections,
  pickerQuestions,
  quizContentToCopy,
  quizModes,
  toPickerQuestions,
  type PickerQuestion,
  type QuizContent,
} from "./composition";

const PAGE_SIZE = 25;

/** Always the signed-in user; nothing about the actor comes from the client. */
async function signedIn(permission: Permission): Promise<Actor> {
  const user = await requirePermission(permission);
  return { id: user.id, role: user.role, departmentId: user.departmentId };
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Could not save. Reload and try again.";
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function searchQuestionsAction(filter: {
  bank?: string;
  type?: string;
  q?: string;
  mine?: boolean;
  page?: number;
}): Promise<{ rows: PickerQuestion[]; more: boolean }> {
  const actor = await signedIn("question.author");
  const page = searchPage(filter?.page);
  const { rows, total } = await searchApprovedQuestions({
    bankId: text(filter?.bank),
    type: text(filter?.type),
    q: text(filter?.q),
    authorId: filter?.mine === true ? actor.id : undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  return {
    rows: await toPickerQuestions(rows),
    more: page < MAX_SEARCH_PAGE && page * PAGE_SIZE < total,
  };
}

/** The course's current revision, or undefined when the actor cannot read it. */
async function readableRevision(actor: Actor, courseId: string): Promise<number | undefined> {
  const [course] = await db
    .select({
      contentRevision: t.courses.contentRevision,
      instructorId: t.courses.instructorId,
      departmentId: t.courses.departmentId,
    })
    .from(t.courses)
    .where(eq(t.courses.id, courseId))
    .limit(1);
  return course && canReadCourse(actor, course) ? course.contentRevision : undefined;
}

/** Saves a new question to its bank and returns it ready to pick. When the
 * write bumped the `courseId` course (its draft draws from that bank), also
 * returns that course's revision as it stands after the write. A course the
 * write did not bump keeps whatever revision the page loaded with, so a
 * change made elsewhere still shows up as stale on the next save. */
export async function createQuestionInlineAction(
  form: FormData,
): Promise<{ error?: string; question?: PickerQuestion; revision?: number }> {
  const actor = await signedIn("question.author");
  const parsed = parseQuestionForm(form);
  if (!parsed.ok) return { error: parsed.error };
  let created: { id: string; bumpedCourseIds: string[] };
  try {
    created = await createQuestion(actor, String(form.get("bankId") ?? ""), parsed.value);
  } catch (error) {
    return { error: message(error) };
  }
  for (const path of ["/admin/questions", "/hr/questions", "/instructor/questions"])
    revalidatePath(path);
  const [question] = await pickerQuestions([created.id]);
  const courseId = text(form.get("courseId"));
  const revision =
    courseId && created.bumpedCourseIds.includes(courseId)
      ? await readableRevision(actor, courseId)
      : undefined;
  return revision === undefined ? { question } : { question, revision };
}

export async function copyQuizContentAction(
  sourceLessonId: string,
): Promise<{ error?: string; content?: QuizContent; questions?: PickerQuestion[] }> {
  const actor = await signedIn("question.author");
  const copy = await quizContentToCopy(actor, String(sourceLessonId ?? ""));
  return copy ?? { error: "This quiz is not available to copy." };
}

async function courseQuiz(tx: LearningTransaction, courseId: string, lessonId: string) {
  const [row] = await tx
    .select({ lesson: t.lessons })
    .from(t.lessons)
    .innerJoin(t.modules, eq(t.lessons.moduleId, t.modules.id))
    .where(and(eq(t.lessons.id, lessonId), eq(t.modules.courseId, courseId)))
    .limit(1);
  if (!row) throw new Error("This lesson does not belong to this course.");
  if (row.lesson.type !== "QUIZ") throw new Error("This lesson is not a quiz.");
  const quizId = row.lesson.payload.quizId;
  const [quiz] = quizId
    ? await tx.select().from(t.quizzes).where(eq(t.quizzes.id, quizId)).limit(1)
    : [];
  if (!quiz) throw new Error("This quiz is no longer available. Reload and try again.");
  return quiz;
}

/** Replaces a draft quiz's title, questions and modes; other settings stay. */
export async function saveQuizAction(
  courseId: string,
  lessonId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await signedIn("course.author");
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Enter a quiz title." };
  try {
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const quiz = await courseQuiz(tx, courseId, lessonId);
        const sections = await composeQuizSections(tx, form);
        await tx
          .update(t.quizzes)
          .set({ title, sections, settings: { ...quiz.settings, ...quizModes(form) } })
          .where(eq(t.quizzes.id, quiz.id));
        await tx.update(t.lessons).set({ title }).where(eq(t.lessons.id, lessonId));
      },
      form.has("revision") ? Number(form.get("revision")) : undefined,
    );
  } catch (error) {
    return { error: message(error) };
  }
  for (const root of ["admin", "hr", "department", "instructor"])
    revalidatePath(`/${root}/courses/${courseId}`);
  revalidatePath(`/course/${courseId}`);
  return { success: "Quiz saved. Submit this revision for approval." };
}
