import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { readSession, type SessionData } from "./session";

export type CurrentUser = typeof t.users.$inferSelect & { session: SessionData };

export async function currentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;
  const [user] = await db.select().from(t.users).where(eq(t.users.id, session.uid)).limit(1);
  if (!user || user.erasedAt) return null;
  return { ...user, session };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN" && user.totpSecret && !user.session.mfa) redirect("/login/mfa");
  if (user.privacyNoticeVersion < 1) redirect("/privacy-notice");
  return user;
}

export async function requireRole(...roles: Array<"ADMIN" | "MANAGER">): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role as "ADMIN" | "MANAGER")) redirect("/home");
  return user;
}

/** Team = explicit manager assignment only (spec FR-1.2). */
export async function teamOf(managerId: string) {
  return db.select().from(t.users).where(eq(t.users.managerId, managerId));
}
