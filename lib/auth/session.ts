import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "ll_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-do-not-use");

export type SessionData = {
  uid: string;
  role: "ADMIN" | "MANAGER" | "LEARNER";
  shared: boolean; // shared-device login → short idle expiry
  /** Managers/admins can flip into their own learner workspace. */
  workspace: "admin" | "manager" | "learner";
  mfa: boolean; // TOTP verified this session (admins)
};

export async function createSession(data: SessionData): Promise<void> {
  const ttlSec = data.shared ? 60 * 15 : 60 * 60 * 24 * 7;
  const jwt = await new SignJWT(data as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
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

export async function readSession(): Promise<SessionData | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    return payload as unknown as SessionData;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
