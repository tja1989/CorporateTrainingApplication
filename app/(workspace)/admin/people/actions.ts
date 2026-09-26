"use server";

import type { ActionResult } from "@/components/workspace-form";
import { parsePeopleCsv, parseDays } from "@/lib/workspace-inputs";
import { setFlash } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { id, activationCode } from "@/lib/ids";
import { reevaluateUser, reevaluateAllUsers } from "@/lib/lms/rules";
import { issueResetCode } from "@/lib/auth/login";

export async function updateUserAction(userId: string, form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const groupId = String(form.get("groupId") ?? "");
  await db
    .update(t.users)
    .set({
      role: String(form.get("role") ?? "LEARNER") as "ADMIN" | "MANAGER" | "LEARNER",
      managerId: String(form.get("managerId") ?? "") || null,
      storeId: String(form.get("storeId") ?? "") || null,
      groupIds: groupId ? [groupId] : [],
      timeMultiplier: Number(form.get("timeMultiplier") ?? 1) || 1,
    })
    .where(eq(t.users.id, userId));
  await reevaluateUser(userId); // profile change re-fires rules (spec FR-3.2)
  await setFlash("Employee details saved and enrollment rules re-evaluated.");
  revalidatePath("/admin/people");
}

export async function issueCodeAction(userId: string): Promise<string> {
  await requireRole("ADMIN");
  return issueResetCode(userId);
}

export async function importCsvAction(form: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const parsed = parsePeopleCsv(String(form.get("csv") ?? ""));
  if (!parsed.rows.length && !parsed.errors.length) return { error: "Paste at least one employee row." };
  const stores = (await db.select().from(t.orgUnits)).filter(o => o.type === "store");
  const groups = await db.select().from(t.groups);
  const existing = await db.select().from(t.users);
  const byEmployeeId = new Map(existing.map(u => [u.employeeId, u]));
  const errors = parsed.errors.map(e => `Row ${e.row}: ${e.message}`); const codes: string[] = [];
  for (const row of parsed.rows) {
    if (byEmployeeId.has(row.employeeId)) { errors.push(`Row ${row.row}: ${row.employeeId} already exists; skipped.`); continue; }
    const store = row.storeName ? stores.find(s => s.name.toLowerCase() === row.storeName.toLowerCase()) : undefined;
    const group = row.groupName ? groups.find(g => g.name.toLowerCase() === row.groupName.toLowerCase()) : undefined;
    const manager = row.managerEmployeeId ? byEmployeeId.get(row.managerEmployeeId) : undefined;
    const problem = row.storeName && !store ? "Store not found." : row.groupName && !group ? "Group not found." : row.managerEmployeeId && (!manager || manager.role === "LEARNER") ? "Manager employee ID must identify an existing manager or administrator." : "";
    if (problem) { errors.push(`Row ${row.row}: ${problem}`); continue; }
    const code = activationCode(); const userId = id();
    const [inserted] = await db.insert(t.users).values({ id: userId, employeeId: row.employeeId, name: row.name, role: row.role, storeId: store?.id ?? null, managerId: manager?.id ?? null, groupIds: group ? [group.id] : [], jobTitle: row.jobTitle || null, hireDate: row.hireDate ? new Date(row.hireDate) : null, passwordState: "INVITED", inviteCodeHash: await bcrypt.hash(code, 10), inviteExpiresAt: new Date(Date.now() + 14 * 24 * 3600_000) }).returning();
    byEmployeeId.set(row.employeeId, inserted);
    await reevaluateUser(userId); codes.push(`${row.employeeId}: ${code}`);
  }
  revalidatePath("/admin/people");
  return { success: `${codes.length} employee${codes.length === 1 ? "" : "s"} imported. ${errors.length} row${errors.length === 1 ? "" : "s"} need attention.`, error: errors.length ? errors.join("\n") : undefined, codes };
}

export async function createRuleAction(form: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const target = String(form.get("target") ?? "");
  const [targetType, targetId] = target.split(":");
  if (!targetId || !["course", "path"].includes(targetType)) return { error: "Choose a course or learning path." };
  const days = parseDays(String(form.get("dueDays") ?? "14"));
  if (days.error) return { error: days.error };
  if (!String(form.get("name") ?? "").trim()) return { error: "Enter a rule name." };
  await db.insert(t.enrollmentRules).values({
    id: id(),
    name: String(form.get("name") ?? "Rule"),
    criteria: {
      groupId: String(form.get("groupId") ?? "") || undefined,
      store: String(form.get("storeId") ?? "") || undefined,
    },
    targetType: targetType as "course" | "path",
    targetId,
    dueRule: { kind: "from_enrollment", days: days.value! },
    active: true,
  });
  await reevaluateAllUsers();
  await setFlash("Changes saved.");
  revalidatePath("/admin/people");
  return { success: "Enrollment rule created and applied." };
}

export async function toggleRuleAction(ruleId: string): Promise<void> {
  await requireRole("ADMIN");
  const [rule] = await db.select().from(t.enrollmentRules).where(eq(t.enrollmentRules.id, ruleId)).limit(1);
  if (!rule) return;
  await db.update(t.enrollmentRules).set({ active: !rule.active }).where(eq(t.enrollmentRules.id, ruleId));
  await reevaluateAllUsers();
  await setFlash("Changes saved.");
  revalidatePath("/admin/people");
}

export async function createGroupAction(form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  await db.insert(t.groups).values({ id: id(), name });
  await setFlash("Changes saved.");
  revalidatePath("/admin/people");
}
