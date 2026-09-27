import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Video seed (M2): DEMO video rows + bundled SRT transcripts run through the
 * real ingestion pipeline (manual provider → chunks → embeddings).
 * NOTE: the YouTube ids below are placeholder public videos for the embed
 * surface; the transcripts are authored demo content that drives the AI
 * features. If an id stops being embeddable the player shows the graceful
 * fallback card — by design (spec FR-5.6).
 */
export async function seedVideos(opts: { courseIds: { customerService: string; foodSafety: string } }): Promise<void> {
  const { db, t } = await import("../lib/db/client");
  const { id } = await import("../lib/ids");
  const { ingestVideo } = await import("../lib/video/ingest");
  const { eq } = await import("drizzle-orm");

  const specs = [
    {
      courseId: opts.courseIds.customerService,
      moduleTitle: "Watch: the greeting standard",
      lessonTitle: "Video: Great first contact",
      videoTitle: "The Demo Retail greeting standard",
      youtubeId: "rrkrvAUbU9Y",
      srt: "customer-greeting.srt",
    },
    {
      courseId: opts.courseIds.foodSafety,
      moduleTitle: "Watch: hand hygiene",
      lessonTitle: "Video: Handwashing that protects",
      videoTitle: "Hand hygiene for fresh food areas",
      youtubeId: "3PmVJQUCm4E",
      playbackDurationSec: 86, // verified public player duration; demo SRT is longer
      srt: "handwashing.srt",
    },
  ];

  for (const spec of specs) {
    const videoId = id();
    await db.insert(t.videos).values({
      id: videoId,
      youtubeId: spec.youtubeId,
      title: spec.videoTitle,
      transcriptSource: "manual",
      ingestionStatus: "PENDING",
    });
    const moduleId = id();
    const existingMods = await db.select().from(t.modules).where(eq(t.modules.courseId, spec.courseId));
    await db.insert(t.modules).values({ id: moduleId, courseId: spec.courseId, title: spec.moduleTitle, sort: existingMods.length });
    await db.insert(t.lessons).values({
      id: id(),
      moduleId,
      type: "VIDEO",
      title: spec.lessonTitle,
      sort: 0,
      payload: { videoId },
    });
    const raw = readFileSync(resolve(process.cwd(), "scripts/assets", spec.srt), "utf8");
    await ingestVideo(videoId, { provider: "manual", rawTranscript: raw });
    if (spec.playbackDurationSec) await db.update(t.videos).set({ durationSec: spec.playbackDurationSec }).where(eq(t.videos.id, videoId));
  }
  console.log("Videos seeded and ingested (manual SRT provider).");
}
