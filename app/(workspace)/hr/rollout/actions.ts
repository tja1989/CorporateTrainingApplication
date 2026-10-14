"use server";
import { requirePermission } from "@/lib/auth/guard";
import { rolloutTraining } from "@/lib/courses/rollout";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/workspace-form";
export async function rolloutAction(form: FormData): Promise<ActionResult> {
  const actor = await requirePermission("course.rollout");
  const [targetType, targetId] = String(form.get("target") ?? "").split(":"),
    [audienceType, audienceId] = String(form.get("audience") ?? "").split(":");
  if (
    !["course", "path"].includes(targetType) ||
    !targetId ||
    !["employee", "department", "group"].includes(audienceType) ||
    !audienceId
  )
    return { error: "Choose training and an audience." };
  try {
    const result = await rolloutTraining(actor, {
      target: { type: targetType as "course" | "path", id: targetId },
      audience: {
        type: audienceType as "employee" | "department" | "group",
        id: audienceId,
      },
      dueDays: Number(form.get("dueDays")),
    });
    revalidatePath("/hr/rollout");
    revalidatePath("/department/rollout");
    revalidatePath("/team");
    return {
      success: `${result.enrolled} new assignment${result.enrolled === 1 ? "" : "s"}. ${result.alreadyAssigned} employee${result.alreadyAssigned === 1 ? " was" : "s were"} already assigned; existing due dates and progress are preserved.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not roll out training.",
    };
  }
}
