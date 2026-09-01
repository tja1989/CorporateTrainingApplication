"use server";

import { redirect } from "next/navigation";
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
  revalidatePath("/admin/people");
}

export async function issueCodeAction(userId: string): Promise<void> {
  const admin = await requireRole("ADMIN");
  const code = await issueResetCode(userId, admin.id);
  const [user] = await db.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  redirect(`/admin/people?codes=${encodeURIComponent(`${user?.employeeId ?? userId}: ${code}`)}`);
}

export async function importCsvAction(form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const csv = String(form.get("csv") ?? "").trim();
  if (!csv) return;
  const stores = (await db.select().from(t.orgUnits)).filter((o) => o.type === "store");
  const groups = await db.select().from(t.groups);
  const existing = await db.select().from(t.users);
  const byEmployeeId = new Map(existing.map((u) => [u.employeeId, u]));
  const results: string[] = [];

  for (const line of csv.split("\n")) {
    const cols = line.split(",").map((s) => s.trim());
    if (cols.length < 3) continue;
    const [employeeId, name, role, storeNameRaw, groupNameRaw, jobTitle, hireDate, managerEmp] = cols;
    const key = employeeId.toUpperCase();
    if (byEmployeeId.has(key)) {
      results.push(`${key}: skipped (exists)`);
      continue;
    }
    const store = stores.find((s) => s.name.toLowerCase().includes((storeNameRaw ?? "").toLowerCase()));
    const group = groups.find((g) => g.name.toLowerCase() === (groupNameRaw ?? "").toLowerCase());
    const manager = managerEmp ? byEmployeeId.get(managerEmp.toUpperCase()) : undefined;
    const code = activationCode();
    const userId = id();
    await db.insert(t.users).values({
      id: userId,
      employeeId: key,
      name: name || key,
      role: (["ADMIN", "MANAGER", "LEARNER"].includes(role?.toUpperCase()) ? role.toUpperCase() : "LEARNER") as "LEARNER",
      storeId: store?.id ?? null,
      managerId: manager?.id ?? null,
      groupIds: group ? [group.id] : [],
      jobTitle: jobTitle || null,
      hireDate: hireDate ? new Date(hireDate) : null,
      passwordState: "INVITED",
      inviteCodeHash: await bcrypt.hash(code, 10),
      inviteExpiresAt: new Date(Date.now() + 14 * 24 * 3600_000),
    });
    await reevaluateUser(userId);
    results.push(`${key}: ${code}`);
  }
  redirect(`/admin/people?codes=${encodeURIComponent(results.join("\n"))}`);
}

export async function createRuleAction(form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const target = String(form.get("target") ?? "");
  const [targetType, targetId] = target.split(":");
  if (!targetId) return;
  await db.insert(t.enrollmentRules).values({
    id: id(),
    name: String(form.get("name") ?? "Rule"),
    criteria: {
      groupId: String(form.get("groupId") ?? "") || undefined,
      store: String(form.get("storeId") ?? "") || undefined,
    },
    targetType: targetType as "course" | "path",
    targetId,
    dueRule: { kind: "from_enrollment", days: Number(form.get("dueDays") ?? 14) || 14 },
    active: true,
  });
  await reevaluateAllUsers();
  revalidatePath("/admin/people");
}

export async function toggleRuleAction(ruleId: string): Promise<void> {
  await requireRole("ADMIN");
  const [rule] = await db.select().from(t.enrollmentRules).where(eq(t.enrollmentRules.id, ruleId)).limit(1);
  if (!rule) return;
  await db.update(t.enrollmentRules).set({ active: !rule.active }).where(eq(t.enrollmentRules.id, ruleId));
  await reevaluateAllUsers();
  revalidatePath("/admin/people");
}

export async function createGroupAction(form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  await db.insert(t.groups).values({ id: id(), name });
  revalidatePath("/admin/people");
}
