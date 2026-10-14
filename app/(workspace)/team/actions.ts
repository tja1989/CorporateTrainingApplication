"use server";

import type { ActionResult } from "@/components/workspace-form";
import { parseDays } from "@/lib/workspace-inputs";
import { revalidatePath } from "next/cache";
import { setFlash } from "@/lib/flash";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { enrollUser } from "@/lib/lms/rules";
import { notify } from "@/lib/notify";
import { issueResetCode } from "@/lib/auth/login";
import { endOfDayInTz } from "@/lib/time";

async function authorizeOnTeam(managerId: string, role: string, userId: string) {
  const [member] = await db.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  if (!member) return null;
  if (role === "MANAGER" && member.managerId !== managerId) return null;
  return member;
}

export async function assignAction(userId: string, form: FormData): Promise<ActionResult> {
  const manager = await requireRole("MANAGER", "ADMIN");
  const member = await authorizeOnTeam(manager.id, manager.role, userId);
  if (!member) return { error: "This employee is outside your team." };
  const target = String(form.get("target") ?? "");
  const [type, id_] = target.split(":");
  if (!id_ || (type !== "course" && type !== "path")) return { error: "Choose a course or learning path." };
  const table = type === "course" ? t.courses : t.paths;
  const [targetRow] = await db.select().from(table).where(eq(table.id, id_)).limit(1);
  if (!targetRow || (type === "course" && "status" in targetRow && targetRow.status !== "PUBLISHED")) return { error: "Choose a published course or available learning path." };
  const due = parseDays(String(form.get("dueDays") ?? "14"));
  if (due.error) return { error: due.error };
  const dueDays = due.value!;
  const dueAt = endOfDayInTz(dueDays);
  const n = await enrollUser(userId, { type: type as "course" | "path", id: id_ }, "manual", manager.id, dueAt);
  if (n > 0) {
    const [course] = type === "course" ? await db.select().from(t.courses).where(eq(t.courses.id, id_)).limit(1) : [];
    await notify(userId, "enrolled", { courseTitle: targetRow.title, ...(type === "path" ? { pathId: id_ } : { courseId: id_ }) });
    await setFlash(`Assigned — due in ${dueDays} day${dueDays === 1 ? "" : "s"}.`);
  } else {
    await setFlash("Already enrolled — nothing changed.", "neutral");
  }
  revalidatePath(`/team/${userId}`);
  return { success: n ? "Training assigned." : "Already enrolled — nothing changed." };
}

export async function nudgeAction(userId: string): Promise<void> {
  const manager = await requireRole("MANAGER", "ADMIN");
  const member = await authorizeOnTeam(manager.id, manager.role, userId);
  if (!member) return;
  // The dispatcher enforces the same rolling 48-hour window as the page.
  // Older reminders stay in the audit/history instead of permanently blocking new ones.
  await notify(userId, "overdue", { courseTitle: "your assigned training", courseId: "" }, `nudge:${userId}`, 48 * 3600_000);
  await setFlash(`Nudge sent to ${member.name}.`);
  revalidatePath(`/team/${userId}`);
}

export async function issueResetAction(userId: string): Promise<string> {
  return issueResetCode(userId);
}
