import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cleanDatabaseUrl, describeDatabaseUrl } from "@/lib/db/url";
import { readInitStatus } from "@/lib/init-status";
import { liveAvailable, listLiveModels, resolveLiveModel } from "@/lib/live/gemini";

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

  /**
   * Which Live model a voice session would actually open against. `voiceConfigured`
   * only says a key is set, and the model is chosen at runtime from whatever the
   * key exposes — so without this, a key that resolves to a model unable to speak
   * looks healthy here and only fails once someone starts talking. Model ids and
   * warnings carry no secrets. Bounded and swallowed: this is a diagnosis
   * endpoint, and it must never be the reason it cannot answer.
   */
  let voiceModel: string | null = null;
  let voiceModelNote: string | null = null;
  let voiceModelsSeen: string[] | null = null;
  if (liveAvailable()) {
    try {
      const resolved = await Promise.race([
        (async () => {
          // The candidates too, not just the winner: which ids a key exposes is
          // the thing you actually need in order to explain the winner, and
          // guessing at it costs a deploy per guess.
          const seen = await listLiveModels();
          return { ...(await resolveLiveModel()), seen };
        })(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout after 4s")), 4000)),
      ]);
      voiceModel = resolved.model;
      voiceModelNote = resolved.warning ?? null;
      voiceModelsSeen = resolved.seen.slice(0, 24);
    } catch (err) {
      voiceModelNote = err instanceof Error ? err.message : "could not resolve a Live model";
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
      voiceModel,
      voiceModelNote,
      voiceModelsSeen,
      interviewLessons,
      demoMode: process.env.DEMO_MODE === "true",
      // Railway sets this on every deployment; it says which build answered.
      commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
