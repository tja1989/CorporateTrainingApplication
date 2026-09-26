import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { suggestQuestions } from "@/lib/ai/tutor";

/** Suggested questions for the chunks around the playhead (spec FR-5.9). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const videoId = url.searchParams.get("videoId") ?? "";
  const pos = Number(url.searchParams.get("pos") ?? 0);
  const chunks = await db
    .select()
    .from(t.videoChunks)
    .where(and(eq(t.videoChunks.videoId, videoId), lte(t.videoChunks.startSec, pos + 60), gte(t.videoChunks.endSec, pos - 30)))
    .orderBy(sql`start_sec`)
    .limit(3);
  const questions = await suggestQuestions(chunks.map((c) => c.text));
  return Response.json({ questions });
}
