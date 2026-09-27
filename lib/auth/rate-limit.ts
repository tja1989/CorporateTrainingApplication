import { and, eq, gte, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";

const MAX_ATTEMPTS = 10;
const WINDOW_MIN = 15;

export async function throttled(key: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.loginAttempts)
    .where(and(eq(t.loginAttempts.key, key), eq(t.loginAttempts.success, false), gte(t.loginAttempts.at, windowStart)));
  return (row?.n ?? 0) >= MAX_ATTEMPTS;
}

export async function recordAttempt(key: string, success: boolean) {
  await db.insert(t.loginAttempts).values({ id: id(), key, success });
}
