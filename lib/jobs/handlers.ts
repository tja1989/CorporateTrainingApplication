import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { ingestVideo, validateYoutubeVideo } from "@/lib/video/ingest";
import type { JobHandler } from "./queue";

export const handlers: Record<string, JobHandler> = {
  ingest_video: async (payload) => {
    await ingestVideo(String(payload.videoId), {
      provider: payload.provider ? String(payload.provider) : undefined,
      rawTranscript: payload.rawTranscript ? String(payload.rawTranscript) : undefined,
    });
  },

  ingest_policy_doc: async (payload) => {
    const { ingestPolicyDoc } = await import("@/lib/hr/ingest");
    await ingestPolicyDoc(String(payload.docId));
  },

  /** Weekly link-health check — curated YouTube corpora rot (spec FR-5.5). */
  health_check_videos: async () => {
    const videos = await db.select().from(t.videos);
    for (const video of videos) {
      const result = await validateYoutubeVideo(video.youtubeId);
      await db
        .update(t.videos)
        .set({
          lastHealthCheckAt: new Date(),
          failureReason: result.ok ? video.failureReason : `Health check: ${result.reason}`,
        })
        .where(eq(t.videos.id, video.id));
    }
  },
};
