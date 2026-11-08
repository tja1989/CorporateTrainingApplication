"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guard";
import { questionBankPath } from "@/lib/navigation";
import type { ActionResult } from "@/components/workspace-form";
import { createBank, createQuestion, editQuestion } from "./bank";
import { parseQuestionForm } from "./validate";

/** Always the signed-in user; nothing about the actor comes from the form. */
async function author() {
  const user = await requirePermission("question.author");
  return {
    user,
    actor: { id: user.id, role: user.role, departmentId: user.departmentId },
  };
}

const revalidateBanks = () => {
  for (const path of ["/admin/questions", "/hr/questions", "/instructor/questions"])
    revalidatePath(path);
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Your changes could not be saved.";

export async function createBankAction(form: FormData): Promise<ActionResult> {
  const { actor } = await author();
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  try {
    await createBank(actor, { name: String(form.get("name") ?? ""), tags });
  } catch (error) {
    return { error: message(error) };
  }
  revalidateBanks();
  return { success: "Bank created." };
}

export async function createQuestionAction(form: FormData): Promise<ActionResult> {
  const { user, actor } = await author();
  const parsed = parseQuestionForm(form);
  if (!parsed.ok) return { error: parsed.error };
  let questionId: string;
  try {
    ({ id: questionId } = await createQuestion(actor, String(form.get("bankId") ?? ""), parsed.value));
  } catch (error) {
    return { error: message(error) };
  }
  revalidateBanks();
  return { href: `${questionBankPath(user.role)}?question=${questionId}` };
}

export async function editQuestionAction(
  questionId: string,
  form: FormData,
): Promise<ActionResult> {
  const { user, actor } = await author();
  const parsed = parseQuestionForm(form);
  if (!parsed.ok) return { error: parsed.error };
  try {
    await editQuestion(actor, questionId, parsed.value);
  } catch (error) {
    return { error: message(error) };
  }
  revalidateBanks();
  return { href: `${questionBankPath(user.role)}?question=${questionId}` };
}
