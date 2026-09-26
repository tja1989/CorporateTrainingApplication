"use server";

import bcrypt from "bcryptjs";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id, activationCode } from "@/lib/ids";
import { createSession, readSession, destroySession } from "./session";
import { verifyTotp } from "./totp";
import { requireRole } from "./guard";
import { redirect } from "next/navigation";

const MAX_ATTEMPTS = 10;
const WINDOW_MIN = 15;

async function throttled(key: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.loginAttempts)
    .where(and(eq(t.loginAttempts.key, key), eq(t.loginAttempts.success, false), gte(t.loginAttempts.at, windowStart)));
  return (row?.n ?? 0) >= MAX_ATTEMPTS;
}

async function recordAttempt(key: string, success: boolean) {
  await db.insert(t.loginAttempts).values({ id: id(), key, success });
}

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

  const workspace = user.role === "LEARNER" ? "learner" : user.role === "MANAGER" ? "manager" : "admin";
  const needsMfaSetup = user.role === "ADMIN" && !user.totpSecret;
  const needsMfaVerify = user.role === "ADMIN" && !!user.totpSecret;
  await createSession({ uid: user.id, role: user.role, shared, workspace, mfa: !needsMfaVerify });
  if (needsMfaSetup) return { ok: true, next: "/login/mfa-setup" };
  if (needsMfaVerify) return { ok: true, next: "/login/mfa" };
  if (user.privacyNoticeVersion < 1) return { ok: true, next: "/privacy-notice" };
  return { ok: true, next: workspace === "learner" ? "/home" : workspace === "manager" ? "/team" : "/admin" };
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

  await db
    .update(t.users)
    .set({
      passwordHash: await bcrypt.hash(newPassword, 10),
      passwordState: "ACTIVE",
      inviteCodeHash: null,
      inviteExpiresAt: null,
    })
    .where(eq(t.users.id, user.id));
  const workspace = user.role === "LEARNER" ? "learner" : user.role === "MANAGER" ? "manager" : "admin";
  await createSession({ uid: user.id, role: user.role, shared: false, workspace, mfa: user.role !== "ADMIN" });
  return { ok: true, next: "/privacy-notice" };
}

export async function verifyMfa(code: string): Promise<LoginResult> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Session expired." };
  const [user] = await db.select().from(t.users).where(eq(t.users.id, session.uid)).limit(1);
  if (!user?.totpSecret) return { ok: false, error: "MFA not configured." };
  if (!verifyTotp(user.totpSecret, code)) return { ok: false, error: "Incorrect code." };
  await createSession({ ...session, mfa: true });
  return { ok: true, next: user.privacyNoticeVersion < 1 ? "/privacy-notice" : "/admin" };
}

export async function acknowledgePrivacyNotice(): Promise<void> {
  const session = await readSession();
  if (!session) redirect("/login");
  await db.update(t.users).set({ privacyNoticeVersion: 1 }).where(eq(t.users.id, session.uid));
  await db.insert(t.consents).values({ id: id(), userId: session.uid, kind: "privacy_notice", version: "1" });
  redirect(session.workspace === "learner" ? "/home" : session.workspace === "manager" ? "/team" : "/admin");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** Manager/admin-mediated reset: issues a fresh one-time code (audit-logged). */
export async function issueResetCode(targetUserId: string, _legacyIssuerId?: string): Promise<string> {
  // This exported server action is directly callable. Never trust the caller's
  // issuer ID or rely on the page that happened to render the reset button.
  const issuer = await requireRole("MANAGER", "ADMIN");
  const [target] = await db.select().from(t.users).where(eq(t.users.id, targetUserId)).limit(1);
  if (!target || target.erasedAt || (issuer.role === "MANAGER" && target.managerId !== issuer.id)) {
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

export async function switchWorkspace(to: "admin" | "manager" | "learner"): Promise<void> {
  const session = await readSession();
  if (!session) redirect("/login");
  const allowed =
    session.role === "ADMIN" ? ["admin", "learner"] : session.role === "MANAGER" ? ["manager", "learner"] : ["learner"];
  if (!allowed.includes(to)) redirect("/home");
  await createSession({ ...session, workspace: to });
  redirect(to === "learner" ? "/home" : to === "manager" ? "/team" : "/admin");
}
