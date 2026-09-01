"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";

export async function clearAttemptAction(attemptId: string): Promise<void> {
  await requireRole("ADMIN");
  const [attempt] = await db.select().from(t.attempts).where(eq(t.attempts.id, attemptId)).limit(1);
  if (!attempt || attempt.state === "VOIDED") return;
  await db.update(t.attempts).set({ state: "CLEARED" }).where(eq(t.attempts.id, attemptId));
  revalidatePath(`/admin/integrity/${attemptId}`);
}

/** Voiding never counts toward the attempts limit and grants a fresh slot (spec FR-7.3). */
export async function voidAttemptAction(attemptId: string, form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return;
  const [attempt] = await db.select().from(t.attempts).where(eq(t.attempts.id, attemptId)).limit(1);
  if (!attempt) return;
  await db.update(t.attempts).set({ state: "VOIDED", voidReason: reason }).where(eq(t.attempts.id, attemptId));
  revalidatePath(`/admin/integrity/${attemptId}`);
}
