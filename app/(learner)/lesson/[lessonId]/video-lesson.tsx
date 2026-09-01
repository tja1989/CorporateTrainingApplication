import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { Card } from "@/components/ui";

/** M1 placeholder — replaced by the full player + Tutor in M2. */
export async function VideoLesson({
  lesson,
  courseId,
  isDone,
}: {
  lesson: typeof t.lessons.$inferSelect;
  courseId: string;
  isDone: boolean;
}) {
  void courseId;
  void isDone;
  const videoId = lesson.payload.videoId;
  const [video] = videoId ? await db.select().from(t.videos).where(eq(t.videos.id, videoId)).limit(1) : [];
  return (
    <Card className="mb-6 max-w-3xl p-6">
      <p className="text-sm text-muted">
        {video ? `Video “${video.title}” — the interactive player arrives in the next milestone.` : "Video not configured yet."}
      </p>
    </Card>
  );
}
