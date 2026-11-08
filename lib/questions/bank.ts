import { and, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { canonicalRole, type Actor } from "@/lib/auth/roles";
import { hasPermission } from "@/lib/auth/permissions";
import { lockAssessmentCurriculum } from "@/lib/courses/locks";
import { reopenDraftCourses } from "@/lib/courses/questions";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";
import { editBlockReason, isDraftCourse, isLiveCourse } from "./rules";
import { randomDrawCourses, referencingCourses, servedCount } from "./usage";
import type { QuestionDraft } from "./validate";

/** Runs a shared-bank write under the assessment lock, after re-reading the
 * actor, so it sees course states only a curriculum author could change. */
function asQuestionAuthor<T>(
  actor: Actor,
  run: (tx: LearningTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockAssessmentCurriculum(tx);
    const [person] = await tx
      .select()
      .from(t.users)
      .where(eq(t.users.id, actor.id))
      .limit(1);
    if (
      !person ||
      person.erasedAt ||
      person.passwordState !== "ACTIVE" ||
      canonicalRole(person.role) !== actor.role ||
      !hasPermission(actor.role, "question.author")
    )
      throw new Error("Not authorized to manage questions.");
    return run(tx);
  });
}

const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");
const nameKey = (name: string) => tidyName(name).toLowerCase();

export async function createBank(
  actor: Actor,
  input: { name: string; tags: string[] },
): Promise<string> {
  return asQuestionAuthor(actor, async (tx) => {
    const name = tidyName(input.name);
    if (!name) throw new Error("Enter a bank name.");
    const banks = await tx
      .select({ name: t.questionBanks.name })
      .from(t.questionBanks);
    if (banks.some((bank) => nameKey(bank.name) === nameKey(name)))
      throw new Error("A bank with this name already exists.");
    const bankId = id();
    await tx
      .insert(t.questionBanks)
      .values({ id: bankId, name, courseId: null, tags: input.tags });
    return bankId;
  });
}

/** A new question joins every random draw from its bank, so live courses
 * drawing from it refuse, and drafts drawing from it start a new revision. */
export async function createQuestion(
  actor: Actor,
  bankId: string,
  draft: QuestionDraft,
): Promise<string> {
  return asQuestionAuthor(actor, async (tx) => {
    const [bank] = await tx
      .select({ id: t.questionBanks.id })
      .from(t.questionBanks)
      .where(eq(t.questionBanks.id, bankId))
      .limit(1);
    if (!bank) throw new Error("Choose a question bank.");
    const courses = await randomDrawCourses(bankId, tx);
    const live = courses.filter(isLiveCourse);
    if (live.length > 0)
      throw new Error(
        `This bank feeds live training (${live.map((c) => c.title).join(", ")}). Choose another bank or create a new one.`,
      );
    await reopenDraftCourses(
      tx,
      courses.filter(isDraftCourse).map((c) => c.id),
    );
    const questionId = id();
    await tx.insert(t.questions).values({
      id: questionId,
      bankId,
      type: draft.type,
      points: draft.points,
      body: draft.body,
      rubric: draft.rubric,
      status: "APPROVED",
      createdBy: "human",
      authorId: actor.id,
    });
    return questionId;
  });
}

export async function editQuestion(
  actor: Actor,
  questionId: string,
  draft: QuestionDraft,
): Promise<void> {
  await asQuestionAuthor(actor, async (tx) => {
    const [question] = await tx
      .select()
      .from(t.questions)
      .where(eq(t.questions.id, questionId))
      .limit(1);
    if (!question || question.status !== "APPROVED")
      throw new Error("Only approved questions can be edited here.");
    const courses = await referencingCourses(question, tx);
    const blocked = editBlockReason({
      actor,
      authorId: question.authorId,
      servedCount: await servedCount(questionId, tx),
      liveCourseTitles: courses.filter(isLiveCourse).map((c) => c.title),
    });
    if (blocked) throw new Error(blocked);
    await reopenDraftCourses(
      tx,
      courses.filter(isDraftCourse).map((c) => c.id),
    );
    await tx
      .update(t.questions)
      .set({
        type: draft.type,
        points: draft.points,
        body: draft.body,
        rubric: draft.rubric,
        version: question.version + 1,
      })
      .where(
        and(eq(t.questions.id, questionId), eq(t.questions.status, "APPROVED")),
      );
  });
}
