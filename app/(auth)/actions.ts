"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { login, activate, verifyMfa } from "@/lib/auth/login";
import { createSession } from "@/lib/auth/session";
import { currentUser } from "@/lib/auth/guard";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";

export type FormState = { error?: string } | null;

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const result = await login(String(form.get("employeeId") ?? ""), String(form.get("password") ?? ""), form.get("shared") === "on");
  if (!result.ok) return { error: result.error };
  redirect(result.next);
}

export async function activateAction(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "Passwords don't match." };
  const result = await activate(String(form.get("employeeId") ?? ""), String(form.get("code") ?? ""), password);
  if (!result.ok) return { error: result.error };
  redirect(result.next);
}

export async function mfaVerifyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const result = await verifyMfa(String(form.get("code") ?? ""));
  if (!result.ok) return { error: result.error };
  redirect(result.next);
}

export async function mfaSetupBegin(): Promise<{ secret: string } | { error: string }> {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") return { error: "Not authorized." };
  if (user.totpSecret) return { error: "Two-factor authentication is already configured. Sign in with your authenticator code." };
  return { secret: generateTotpSecret() };
}

export async function mfaSetupConfirm(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") return { error: "Not authorized." };
  if (user.totpSecret) return { error: "Two-factor authentication is already configured. Sign in with your authenticator code." };
  const secret = String(form.get("secret") ?? "");
  const code = String(form.get("code") ?? "");
  if (!secret || !verifyTotp(secret, code)) return { error: "Code doesn't match. Check your authenticator app." };
  const [updated] = await db.update(t.users).set({ totpSecret: secret })
    .where(and(eq(t.users.id, user.id), isNull(t.users.totpSecret))).returning({ id: t.users.id });
  if (!updated) return { error: "Two-factor authentication is already configured. Sign in with your authenticator code." };
  await createSession({ ...user.session, mfa: true });
  redirect("/privacy-notice");
}
