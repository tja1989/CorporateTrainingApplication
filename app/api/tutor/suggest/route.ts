import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { suggestQuestions } from "@/lib/ai/tutor";
import { allowedTutorSources } from "@/lib/ai/tutor-sources";

/** Suggested questions for the chunks around the playhead (spec FR-5.9). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const videoId = url.searchParams.get("videoId") ?? "";
  const lessonId = url.searchParams.get("lessonId") ?? "";
  const pos = Number(url.searchParams.get("pos") ?? 0);
  // Older clients send only videoId. Resolve a lesson they may actually open;
  // an explicit lesson must match rather than falling through to another one.
  const candidates = lessonId ? [{ id: lessonId }] : await db.select({ id: t.lessons.id }).from(t.lessons)
    .where(and(eq(t.lessons.type, "VIDEO"), sql`${t.lessons.payload}->>'videoId' = ${videoId}`));
  let source;
  for (const candidate of candidates) {
    const allowed = await allowedTutorSources(user.id, candidate.id);
    source = allowed?.sources.find(source => source.lessonId === candidate.id && source.videoId === videoId);
    if (source) break;
  }
  if (!source) return new Response("Not found", { status: 404 });
  if (!Number.isFinite(pos) || pos < 0 || pos > source.durationSec) return new Response("Bad request", { status: 400 });
  const chunks = await db
    .select()
    .from(t.videoChunks)
    .where(and(eq(t.videoChunks.videoId, videoId), lte(t.videoChunks.startSec, pos + 60), gte(t.videoChunks.endSec, pos - 30)))
    .orderBy(sql`start_sec`)
    .limit(3);
  const questions = await suggestQuestions(chunks.map((c) => c.text));
  return Response.json({ questions });
}
