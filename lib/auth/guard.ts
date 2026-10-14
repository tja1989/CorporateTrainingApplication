import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { readSession, type SessionData } from "./session";
import { canonicalRole, effectiveWorkspace, needsMfa, type Role, type StoredRole } from "./roles";
import { hasPermission, type Permission } from "./permissions";

export type CurrentUser = Omit<typeof t.users.$inferSelect, "role"> & { role: Role; session: SessionData };

export async function currentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;
  const [user] = await db.select().from(t.users).where(eq(t.users.id, session.uid)).limit(1);
  if (!user || user.erasedAt) return null;
  const role = canonicalRole(user.role);
  if (!role) return null;
  return { ...user, departmentId: user.departmentId ?? null, role,
    session: { ...session, role, workspace: effectiveWorkspace(role, session.workspace),
      mfa: session.mfa && canonicalRole(session.role) === role } };
}

/** JSON/media endpoints must enforce the same completed sign-in gates as pages. */
export async function apiUser(): Promise<CurrentUser | null> {
  const user = await currentUser();
  if (!user || user.privacyNoticeVersion < 1 || (needsMfa(user.role) && (!user.totpSecret || !user.session.mfa))) return null;
  return user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (needsMfa(user.role) && !user.totpSecret) redirect("/login/mfa-setup");
  if (needsMfa(user.role) && !user.session.mfa) redirect("/login/mfa");
  if (user.privacyNoticeVersion < 1) redirect("/privacy-notice");
  return user;
}

export async function requireRole(...roles: StoredRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.some(role => canonicalRole(role) === user.role)) redirect("/home");
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user.role, permission)) redirect("/home");
  return user;
}

/** Team = explicit manager assignment only (spec FR-1.2). */
export async function teamOf(managerId: string) {
  return db.select().from(t.users).where(eq(t.users.managerId, managerId));
}
