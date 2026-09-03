import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cleanDatabaseUrl, describeDatabaseUrl } from "@/lib/db/url";
import { readInitStatus } from "@/lib/init-status";

export const dynamic = "force-dynamic";

/**
 * Self-diagnosis endpoint: shows exactly what the deployment is doing without
 * needing platform logs. No secrets — host/db names only, never credentials.
 */
export async function GET() {
  const url = cleanDatabaseUrl(process.env.DATABASE_URL);
  let dbPing = "not attempted";
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout after 2.5s")), 2500)),
    ]);
    dbPing = "ok";
  } catch (err) {
    dbPing = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  let seededUsers: number | string = "unknown";
  let interviewLessons: number | null = null;
  if (dbPing === "ok") {
    try {
      const res = (await db.execute(sql`SELECT count(*)::int AS n FROM users`)) as unknown as { rows: Array<{ n: number }> };
      seededUsers = res.rows[0]?.n ?? 0;
      const il = (await db.execute(sql`SELECT count(*)::int AS n FROM lessons WHERE type = 'INTERVIEW'`)) as unknown as { rows: Array<{ n: number }> };
      interviewLessons = il.rows[0]?.n ?? 0;
    } catch (err) {
      seededUsers = `schema missing (${err instanceof Error ? err.message.slice(0, 60) : "?"})`;
    }
  }

  return Response.json(
    {
      app: "ok — web server is up and reachable",
      port: process.env.PORT ?? "3000 (default)",
      databaseTarget: url ? describeDatabaseUrl(url) : "DATABASE_URL NOT SET",
      databasePing: dbPing,
      seededUsers,
      init: readInitStatus() ?? "no status yet (init loop not started)",
      aiConfigured: !!process.env.ANTHROPIC_API_KEY,
      voiceConfigured: !!process.env.GEMINI_API_KEY,
      interviewLessons,
      demoMode: process.env.DEMO_MODE === "true",
      // Railway sets this on every deployment; it says which build answered.
      commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
