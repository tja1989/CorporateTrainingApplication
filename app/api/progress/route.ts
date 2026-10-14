import { and, eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { markLessonCompleteInTransaction } from "@/lib/lms/completion";
import { currentCycleStart, lessonCourseId, lockLearningCourse, type LearningWriteContext } from "@/lib/lms/learning-cycle";
import { learnerLesson } from "@/lib/lms/lesson-access";
import { clampVideoPosition, videoHeartbeat } from "@/lib/lms/video-progress";

/** A heartbeat credits one watched bucket. Resume position never fills skipped coverage. */
export async function POST(req: Request) {
  const receivedAt = new Date();
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.lessonId !== "string") return new Response("Bad request", { status: 400 });
  const courseId = await lessonCourseId(body.lessonId);
  if (!courseId) return new Response("Bad request", { status: 400 });
  const afterCommit: LearningWriteContext["afterCommit"] = [];
  const result = await db.transaction(async connection => {
    // Authorization, bucket merge, completion and renewal see one serialized
    // cycle. Every nested read/write uses this client, including outline reads.
    await lockLearningCourse(connection, user.id, courseId);
    const cycle = await currentCycleStart(user.id, courseId, connection);
    if (cycle && receivedAt < cycle) return new Response("Training was renewed. This heartbeat belongs to the previous cycle.", { status: 409 });
    const access = await learnerLesson(user.id, body.lessonId, connection);
    if (!access || access.lesson.type !== "VIDEO" || !access.lesson.payload.videoId) return new Response("Bad request", { status: 400 });
    if (access.self.locked) return new Response("Complete the previous lessons first", { status: 403 });
    const [video] = await connection.select().from(t.videos).where(eq(t.videos.id, access.lesson.payload.videoId)).limit(1);
    if (!video || clampVideoPosition(body.positionSec, video.durationSec) === null) return new Response("Invalid video position", { status: 400 });
    const [existing] = await connection.select().from(t.lessonProgress).where(and(eq(t.lessonProgress.userId, user.id), eq(t.lessonProgress.lessonId, access.lesson.id))).limit(1);
    const progress = videoHeartbeat(existing?.watchedBuckets ?? [], body.positionSec, video.durationSec);
    await connection.insert(t.lessonProgress).values({ id: id(), userId: user.id, lessonId: access.lesson.id, status: "IN_PROGRESS", watchedBuckets: progress.watchedBuckets, lastPositionSec: progress.lastPositionSec })
      .onConflictDoUpdate({ target: [t.lessonProgress.userId, t.lessonProgress.lessonId], set: {
        status: sql`CASE WHEN ${t.lessonProgress.status} = 'COMPLETED' THEN 'COMPLETED' ELSE 'IN_PROGRESS' END`,
        watchedBuckets: progress.watchedBuckets, lastPositionSec: progress.lastPositionSec, updatedAt: new Date(),
      } });
    const completed = existing?.status === "COMPLETED" || progress.complete;
    if (existing?.status !== "COMPLETED" && progress.complete) {
      await markLessonCompleteInTransaction({ connection, afterCommit }, user.id, access.lesson.id, courseId, receivedAt);
    }
    const outline = completed ? (existing?.status === "COMPLETED" ? access.view : (await learnerLesson(user.id, access.lesson.id, connection))?.view) : undefined;
    return Response.json({ outline, coveragePct: progress.coveragePct, completed, lastPositionSec: progress.lastPositionSec });
  });
  for (const effect of afterCommit) await effect();
  return result;
}
