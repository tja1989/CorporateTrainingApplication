import { and, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { markLessonComplete } from "@/lib/lms/completion";

const BUCKET_SEC = 5;
const COVERAGE_THRESHOLD = 0.9;

/**
 * Watch-progress heartbeat (spec FR-5.7): unique watched-second buckets;
 * completion = coverage ≥ 90%. Client-reported and spoofable by a determined
 * user — acceptable for training compliance; the quiz is the real gate.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as { lessonId: string; positionSec: number };
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, body.lessonId)).limit(1);
  if (!lesson || lesson.type !== "VIDEO" || !lesson.payload.videoId) return new Response("Bad request", { status: 400 });
  const [video] = await db.select().from(t.videos).where(eq(t.videos.id, lesson.payload.videoId)).limit(1);
  if (!video) return new Response("Bad request", { status: 400 });

  const bucket = Math.max(0, Math.floor(body.positionSec / BUCKET_SEC));
  const [existing] = await db
    .select()
    .from(t.lessonProgress)
    .where(and(eq(t.lessonProgress.userId, user.id), eq(t.lessonProgress.lessonId, lesson.id)))
    .limit(1);

  const buckets = new Set(existing?.watchedBuckets ?? []);
  buckets.add(bucket);
  const watched = [...buckets].sort((a, b) => a - b);

  if (existing) {
    if (existing.status !== "COMPLETED") {
      await db
        .update(t.lessonProgress)
        .set({ watchedBuckets: watched, status: "IN_PROGRESS", updatedAt: new Date() })
        .where(eq(t.lessonProgress.id, existing.id));
    }
  } else {
    await db.insert(t.lessonProgress).values({
      id: id(),
      userId: user.id,
      lessonId: lesson.id,
      status: "IN_PROGRESS",
      watchedBuckets: watched,
    });
  }

  const totalBuckets = Math.max(1, Math.ceil(video.durationSec / BUCKET_SEC));
  const coverage = watched.filter((b) => b < totalBuckets).length / totalBuckets;
  let completed = existing?.status === "COMPLETED";
  if (!completed && coverage >= COVERAGE_THRESHOLD) {
    await markLessonComplete(user.id, lesson.id);
    completed = true;
  }
  return Response.json({ coveragePct: Math.min(100, Math.round(coverage * 100)), completed });
}
