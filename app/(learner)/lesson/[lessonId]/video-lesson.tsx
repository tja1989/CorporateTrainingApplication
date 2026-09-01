import { and, asc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { Card } from "@/components/ui";
import { VideoLessonClient } from "./video-client";

/** Video lesson: player + Tutor + transcript (spec FR-5.6..5.13, §11.5). */
export async function VideoLesson({
  lesson,
  courseId,
  isDone,
}: {
  lesson: typeof t.lessons.$inferSelect;
  courseId: string;
  isDone: boolean;
}) {
  const user = await currentUser();
  const videoId = lesson.payload.videoId;
  const [video] = videoId ? await db.select().from(t.videos).where(eq(t.videos.id, videoId)).limit(1) : [];
  if (!video) {
    return (
      <Card className="mb-6 max-w-3xl p-6">
        <p className="text-sm text-muted">Video not configured yet.</p>
      </Card>
    );
  }
  if (video.ingestionStatus !== "READY") {
    return (
      <Card className="mb-6 max-w-3xl p-6">
        <p className="text-sm text-muted">
          This video is still being prepared ({video.ingestionStatus.toLowerCase()}
          {video.failureReason ? ` — ${video.failureReason}` : ""}). Check back shortly.
        </p>
      </Card>
    );
  }

  const chunks = await db
    .select()
    .from(t.videoChunks)
    .where(eq(t.videoChunks.videoId, video.id))
    .orderBy(asc(t.videoChunks.startSec));

  let initialMessages: Array<{ role: "user" | "assistant"; content: string; citations?: { startSec: number; endSec: number; quote: string }[] }> = [];
  let threadId: string | null = null;
  if (user) {
    const [thread] = await db
      .select()
      .from(t.tutorThreads)
      .where(and(eq(t.tutorThreads.userId, user.id), eq(t.tutorThreads.courseId, courseId)))
      .limit(1);
    if (thread) {
      threadId = thread.id;
      const msgs = await db
        .select()
        .from(t.tutorMessages)
        .where(eq(t.tutorMessages.threadId, thread.id))
        .orderBy(asc(t.tutorMessages.createdAt));
      initialMessages = msgs.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
        citations: m.citations ?? undefined,
      }));
    }
  }

  return (
    <VideoLessonClient
      lessonId={lesson.id}
      youtubeId={video.youtubeId}
      videoId={video.id}
      chunks={chunks.map((c) => ({ id: c.id, startSec: c.startSec, endSec: c.endSec, text: c.text }))}
      initialMessages={initialMessages}
      initialThreadId={threadId}
      initialCompleted={isDone}
    />
  );
}
