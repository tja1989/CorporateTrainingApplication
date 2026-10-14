"use server";

import bcrypt from "bcryptjs";
import { throttled, recordAttempt } from "./rate-limit";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id, activationCode } from "@/lib/ids";
import { createSession, readSession, destroySession } from "./session";
import { verifyTotp } from "./totp";
import { requireRole, requireUser } from "./guard";
import { canonicalRole, defaultWorkspace, effectiveWorkspace, workspaceHome, needsMfa, allowedWorkspaces, canResetPerson, type Workspace } from "./roles";
import { redirect } from "next/navigation";

export type LoginResult = { ok: true; next: string } | { ok: false; error: string };

export async function login(employeeId: string, password: string, shared: boolean): Promise<LoginResult> {
  const key = employeeId.trim().toUpperCase();
  if (await throttled(key)) {
    return { ok: false, error: "Too many attempts. Try again in 15 minutes or ask your manager for a reset code." };
  }
  const [user] = await db.select().from(t.users).where(eq(t.users.employeeId, key)).limit(1);
  if (!user || user.erasedAt || user.passwordState !== "ACTIVE" || !user.passwordHash) {
    await recordAttempt(key, false);
    return { ok: false, error: "Employee ID or password is incorrect." };
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  await recordAttempt(key, match);
  if (!match) return { ok: false, error: "Employee ID or password is incorrect." };

  const role = canonicalRole(user.role);
  if (!role) return { ok: false, error: "Employee ID or password is incorrect." };
  const workspace = defaultWorkspace(role);
  const needsMfaSetup = needsMfa(role) && !user.totpSecret;
  const needsMfaVerify = needsMfa(role) && !!user.totpSecret;
  await createSession({ uid: user.id, role, shared, workspace, mfa: !needsMfa(role) });
  if (needsMfaSetup) return { ok: true, next: "/login/mfa-setup" };
  if (needsMfaVerify) return { ok: true, next: "/login/mfa" };
  if (user.privacyNoticeVersion < 1) return { ok: true, next: "/privacy-notice" };
  return { ok: true, next: workspaceHome(workspace) };
}

export async function activate(employeeId: string, code: string, newPassword: string): Promise<LoginResult> {
  const key = employeeId.trim().toUpperCase();
  if (await throttled(key)) return { ok: false, error: "Too many attempts. Try again later." };
  const [user] = await db.select().from(t.users).where(eq(t.users.employeeId, key)).limit(1);
  if (!user || user.passwordState !== "INVITED" || !user.inviteCodeHash) {
    await recordAttempt(key, false);
    return { ok: false, error: "Activation failed. Check your employee ID and code." };
  }
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
    return { ok: false, error: "This activation code has expired. Ask your manager for a new one." };
  }
  const match = await bcrypt.compare(code.trim().toUpperCase(), user.inviteCodeHash);
  await recordAttempt(key, match);
  if (!match) return { ok: false, error: "Activation failed. Check your employee ID and code." };
  if (newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const role = canonicalRole(user.role);
  if (!role || user.erasedAt) return { ok: false, error: "Activation failed. Check your employee ID and code." };

  await db
    .update(t.users)
    .set({
      passwordHash: await bcrypt.hash(newPassword, 10),
      passwordState: "ACTIVE",
      inviteCodeHash: null,
      inviteExpiresAt: null,
    })
    .where(eq(t.users.id, user.id));
  const workspace = defaultWorkspace(role);
  await createSession({ uid: user.id, role, shared: false, workspace, mfa: !needsMfa(role) });
  if (needsMfa(role)) return { ok: true, next: user.totpSecret ? "/login/mfa" : "/login/mfa-setup" };
  return { ok: true, next: "/privacy-notice" };
}

export async function verifyMfa(code: string): Promise<LoginResult> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Session expired." };
  const [user] = await db.select().from(t.users).where(eq(t.users.id, session.uid)).limit(1);
  const role = user && canonicalRole(user.role);
  if (!user?.totpSecret || user.erasedAt || !role || !needsMfa(role)) return { ok: false, error: "MFA not configured." };
  if (!verifyTotp(user.totpSecret, code)) return { ok: false, error: "Incorrect code." };
  const workspace = effectiveWorkspace(role, session.workspace);
  await createSession({ ...session, role, workspace, mfa: true });
  return { ok: true, next: user.privacyNoticeVersion < 1 ? "/privacy-notice" : workspaceHome(workspace) };
}

export async function acknowledgePrivacyNotice(): Promise<void> {
  const { currentUser } = await import("./guard");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (needsMfa(user.role) && (!user.totpSecret || !user.session.mfa)) redirect(user.totpSecret ? "/login/mfa" : "/login/mfa-setup");
  await db.update(t.users).set({ privacyNoticeVersion: 1 }).where(eq(t.users.id, user.id));
  await db.insert(t.consents).values({ id: id(), userId: user.id, kind: "privacy_notice", version: "1" });
  redirect(workspaceHome(user.session.workspace));
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** Manager/admin-mediated reset: issues a fresh one-time code (audit-logged). */
export async function issueResetCode(targetUserId: string, _legacyIssuerId?: string): Promise<string> {
  // This exported server action is directly callable. Never trust the caller's
  // issuer ID or rely on the page that happened to render the reset button.
  const issuer = await requireRole("MANAGER", "ADMIN", "HR_HEAD");
  const [target] = await db.select().from(t.users).where(eq(t.users.id, targetUserId)).limit(1);
  const issuerRole = canonicalRole(issuer.role), targetRole = target && canonicalRole(target.role);
  if (!target || target.erasedAt || !issuerRole || !targetRole || !canResetPerson(
    {id:issuer.id,role:issuerRole,departmentId:issuer.departmentId ?? null},
    {id:target.id,role:targetRole,departmentId:target.departmentId ?? null},
  )) {
    throw new Error("You can only reset accounts you manage.");
  }
  const code = activationCode();
  await db
    .update(t.users)
    .set({
      inviteCodeHash: await bcrypt.hash(code, 10),
      inviteExpiresAt: new Date(Date.now() + 14 * 24 * 3600_000),
      passwordState: "INVITED",
      passwordHash: null,
    })
    .where(eq(t.users.id, targetUserId));
  await db.insert(t.uiEvents).values({
    id: id(),
    userId: issuer.id,
    kind: "reset_code_issued",
    payload: { targetUserId },
  });
  return code;
}

export async function switchWorkspace(to: Workspace | "manager"): Promise<void> {
  const user = await requireUser();
  const workspace = to === "manager" ? "department" : to;
  if (!allowedWorkspaces(user.role).includes(workspace)) redirect("/home");
  await createSession({ ...user.session, role:user.role, workspace });
  redirect(workspaceHome(workspace));
}
