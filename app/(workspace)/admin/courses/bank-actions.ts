"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import type { ActionResult } from "@/components/workspace-form";
import { db, t } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { mutateDraftCourse } from "@/lib/courses/workflow";
import { parseQuestionInput } from "@/lib/courses/question-input";
import { updateDraftQuestion } from "@/lib/courses/questions";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";

/** Instructors write questions inside a course they can author. The whole
 * course still goes through Department Head approval, so authored questions
 * are approved on save; AI drafts keep their separate HR review. */

function failed(error: unknown): ActionResult {
  return { error: error instanceof Error ? error.message : "Could not save. Reload and try again." };
}
function refresh(courseId: string) {
  for (const root of ["admin", "hr", "department", "instructor"])
    revalidatePath(`/${root}/courses/${courseId}`);
}
function revision(form: FormData): number | undefined {
  return form.has("revision") ? Number(form.get("revision")) : undefined;
}
async function courseBank(tx: LearningTransaction, courseId: string, bankId: string) {
  const [bank] = await tx.select().from(t.questionBanks).where(eq(t.questionBanks.id, bankId)).limit(1);
  if (!bank || bank.courseId !== courseId) throw new Error("This question bank does not belong to this course.");
  return bank;
}
function questionFromForm(form: FormData) {
  return parseQuestionInput({
    type: String(form.get("type") ?? ""),
    prompt: String(form.get("prompt") ?? ""),
    options: form.getAll("options").map(String),
    correct: form.getAll("correct").map(String),
    accepted: String(form.get("accepted") ?? ""),
    explanation: String(form.get("explanation") ?? ""),
  });
}

export async function createBankAction(courseId: string, form: FormData): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  if (!name) return { error: "Name the question bank." };
  try {
    await mutateDraftCourse(actor, courseId, async (tx) => {
      await tx.insert(t.questionBanks).values({ id: id(), name, courseId, tags: [] });
    }, revision(form));
    refresh(courseId);
    return { success: "Question bank created." };
  } catch (error) {
    return failed(error);
  }
}

/** Adds a question, or replaces one: the old version is retired so past
 * attempts keep the wording learners actually saw. */
export async function saveQuestionAction(
  courseId: string,
  bankId: string,
  questionId: string | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  const parsed = questionFromForm(form);
  if ("error" in parsed) return parsed;
  try {
    await mutateDraftCourse(actor, courseId, async (tx) => {
      await courseBank(tx, courseId, bankId);
      let version = 1;
      if (questionId) {
        const [existing] = await tx
          .select()
          .from(t.questions)
          .where(and(eq(t.questions.id, questionId), eq(t.questions.bankId, bankId)))
          .limit(1);
        if (!existing || existing.status === "RETIRED") throw new Error("This question was removed. Reload and try again.");
        await tx.update(t.questions).set({ status: "RETIRED" }).where(eq(t.questions.id, questionId));
        version = existing.version + 1;
      }
      await tx.insert(t.questions).values({
        id: id(),
        bankId,
        type: parsed.value.type,
        status: "APPROVED",
        points: 1,
        body: parsed.value.body,
        createdBy: "human",
        version,
      });
    }, revision(form));
    refresh(courseId);
    return { success: questionId ? "Question updated." : "Question added." };
  } catch (error) {
    return failed(error);
  }
}

export async function removeQuestionAction(
  courseId: string,
  bankId: string,
  questionId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  try {
    await mutateDraftCourse(actor, courseId, async (tx) => {
      await courseBank(tx, courseId, bankId);
      await tx
        .update(t.questions)
        .set({ status: "RETIRED" })
        .where(and(eq(t.questions.id, questionId), eq(t.questions.bankId, bankId)));
    }, revision(form));
    refresh(courseId);
    return { success: "Question removed." };
  } catch (error) {
    return failed(error);
  }
}

/** AI-drafted questions in a bank this course's quiz uses: the author approves or discards them. */
export async function reviewDraftQuestionAction(
  courseId: string,
  questionId: string,
  decision: "APPROVED" | "RETIRED",
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  try {
    await updateDraftQuestion(actor, questionId, decision);
    refresh(courseId);
    return { success: decision === "APPROVED" ? "Question approved." : "Question discarded." };
  } catch (error) {
    return failed(error);
  }
}
