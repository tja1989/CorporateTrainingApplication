"use server";
import type { ActionResult } from "@/components/workspace-form";
import { revalidatePath } from "next/cache";
import { setFlash } from "@/lib/flash";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { canResetPerson, canonicalRole, type Actor } from "@/lib/auth/roles";
import { rolloutTraining } from "@/lib/courses/rollout";
import { notify } from "@/lib/notify";
import { NUDGE_WINDOW_MS, nudgeKey } from "@/lib/nudge";
import { issueResetCode } from "@/lib/auth/login";
async function authorizeOnTeam(actor: Actor, userId: string) {
  const [person] = await db
    .select()
    .from(t.users)
    .where(eq(t.users.id, userId))
    .limit(1);
  const role = person && canonicalRole(person.role);
  return person &&
    !person.erasedAt &&
    role &&
    canResetPerson(actor, {
      id: person.id,
      role,
      departmentId: person.departmentId,
    })
    ? person
    : null;
}
export async function assignAction(
  userId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireRole("DEPARTMENT_HEAD", "ADMIN", "HR_HEAD");
  const [type, id] = String(form.get("target") ?? "").split(":");
  if (!id || !["course", "path"].includes(type))
    return { error: "Choose a course or learning path." };
  try {
    const result = await rolloutTraining(actor, {
      target: { type: type as "course" | "path", id },
      audience: { type: "employee", id: userId },
      dueDays: Number(form.get("dueDays") ?? 14),
    });
    revalidatePath(`/team/${userId}`);
    return {
      success: result.enrolled
        ? "Training assigned."
        : "Already enrolled — nothing changed.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not assign training.",
    };
  }
}
export async function nudgeAction(userId: string): Promise<void> {
  const actor = await requireRole("DEPARTMENT_HEAD", "ADMIN", "HR_HEAD");
  const member = await authorizeOnTeam(actor, userId);
  if (!member) throw new Error("This employee is outside your department.");
  const sent = await notify(
    userId,
    "overdue",
    { courseTitle: "your assigned training", courseId: "" },
    nudgeKey(userId),
    NUDGE_WINDOW_MS,
  );
  await setFlash(sent ? `Nudge sent to ${member.name}.` : `${member.name} was already reminded in the last 48 hours.`);
  revalidatePath(`/team/${userId}`);
  revalidatePath("/team");
}
export async function issueResetAction(userId: string): Promise<string> {
  return issueResetCode(userId);
}
