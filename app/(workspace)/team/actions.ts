"use server";

import { redirect } from "next/navigation";
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

export async function assignAction(userId: string, form: FormData): Promise<void> {
  const manager = await requireRole("MANAGER", "ADMIN");
  const member = await authorizeOnTeam(manager.id, manager.role, userId);
  if (!member) return;
  const target = String(form.get("target") ?? "");
  const [type, id_] = target.split(":");
  if (!id_ || (type !== "course" && type !== "path")) return;
  const dueDays = Number(form.get("dueDays") ?? 14);
  const dueAt = endOfDayInTz(dueDays);
  const n = await enrollUser(userId, { type: type as "course" | "path", id: id_ }, "manual", manager.id, dueAt);
  if (n > 0) {
    const [course] = type === "course" ? await db.select().from(t.courses).where(eq(t.courses.id, id_)).limit(1) : [];
    await notify(userId, "enrolled", { courseTitle: course?.title ?? "New training", courseId: id_ });
    await setFlash(`Assigned — due in ${dueDays} day${dueDays === 1 ? "" : "s"}.`);
  } else {
    await setFlash("Already enrolled — nothing changed.", "neutral");
  }
  revalidatePath(`/team/${userId}`);
}

export async function nudgeAction(userId: string): Promise<void> {
  const manager = await requireRole("MANAGER", "ADMIN");
  const member = await authorizeOnTeam(manager.id, manager.role, userId);
  if (!member) return;
  // rate limit: dedupe key per member, cleared by the 48h check in the UI; the
  // dedupe also hard-stops duplicates at the dispatcher level
  await notify(userId, "overdue", { courseTitle: "your assigned training", courseId: "" }, `nudge:${userId}`);
  await setFlash(`Nudge sent to ${member.name}.`);
  revalidatePath(`/team/${userId}`);
}

export async function issueResetAction(userId: string): Promise<void> {
  const manager = await requireRole("MANAGER", "ADMIN");
  const member = await authorizeOnTeam(manager.id, manager.role, userId);
  if (!member) return;
  const code = await issueResetCode(userId, manager.id);
  redirect(`/team/${userId}/reset-code?code=${encodeURIComponent(code)}`);
}
