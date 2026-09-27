import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "ll_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-do-not-use");

export type SessionData = {
  uid: string;
  /** Stable across claim updates; a fresh credential login creates a new identity. */
  loginId?: string;
  role: "ADMIN" | "MANAGER" | "LEARNER";
  shared: boolean; // shared-device login → short idle expiry
  /** Managers/admins can flip into their own learner workspace. */
  workspace: "admin" | "manager" | "learner";
  hrHistoryVerifiedAt?: number;
  activeHrConversationId?: string;
  iat?: number;
  exp?: number;
  mfa: boolean; // TOTP verified this session (admins)
};

export async function createSession(data: SessionData): Promise<void> {
  const ttlSec = data.shared ? 60 * 15 : 60 * 60 * 24 * 7;
  await writeSession({ ...data, loginId: data.loginId ?? randomUUID() }, Math.floor(Date.now() / 1000) + ttlSec);
}

async function writeSession(data: SessionData, expiresAt: number): Promise<void> {
  const ttlSec = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  const jwt = await new SignJWT(data as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(data.iat ?? Math.floor(Date.now() / 1000))
    .setExpirationTime(expiresAt)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlSec,
  });
}

/** HR grants rotate the signed cookie without extending the authenticated session. */
export async function updateHrSession(data: SessionData, changes: Pick<SessionData, "hrHistoryVerifiedAt" | "activeHrConversationId">): Promise<void> {
  if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) throw new Error("Session expired. Sign in again.");
  await writeSession({ ...data, ...changes }, data.exp);
}

export async function readSession(): Promise<SessionData | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    const data = payload as unknown as SessionData;
    // Existing signed cookies get a stable identity for their exact legacy login.
    // Subsequent MFA/workspace/HR updates retain it; fresh logins use random UUIDs.
    return { ...data, loginId: data.loginId ?? `legacy:${createHash("sha256").update(raw).digest("hex")}` };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
