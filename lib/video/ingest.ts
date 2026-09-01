import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { getProvider } from "./transcript";
import { chunkTranscript } from "./chunk";
import { embed } from "@/lib/ai/embeddings";

/**
 * Ingestion pipeline (spec FR-5.2/5.3): transcript → timestamped chunks →
 * embeddings → READY. Status transitions surfaced to admins with retry.
 */
export async function ingestVideo(videoId: string, opts: { provider?: string; rawTranscript?: string }): Promise<void> {
  const [video] = await db.select().from(t.videos).where(eq(t.videos.id, videoId)).limit(1);
  if (!video) throw new Error(`Video ${videoId} not found`);
  const set = (status: typeof t.videos.$inferSelect.ingestionStatus, failureReason?: string) =>
    db.update(t.videos).set({ ingestionStatus: status, failureReason: failureReason ?? null }).where(eq(t.videos.id, videoId));

  try {
    await set("FETCHING");
    const provider = getProvider(opts.provider ?? video.transcriptSource);
    const { snippets, lang, isGenerated } = await provider.fetchTranscript({
      youtubeId: video.youtubeId,
      raw: opts.rawTranscript,
    });

    await set("CHUNKING");
    const chunks = chunkTranscript(snippets);
    if (chunks.length === 0) throw new Error("Transcript produced no chunks");

    await set("EMBEDDING");
    const vectors = await embed(chunks.map((c) => `${video.title}\n${c.text}`), "document");

    await db.delete(t.videoChunks).where(eq(t.videoChunks.videoId, videoId));
    for (let i = 0; i < chunks.length; i++) {
      await db.insert(t.videoChunks).values({
        id: id(),
        videoId,
        startSec: chunks[i].startSec,
        endSec: chunks[i].endSec,
        text: chunks[i].text,
        embedding: vectors[i],
      });
    }
    const durationSec = Math.max(video.durationSec, chunks[chunks.length - 1].endSec);
    await db
      .update(t.videos)
      .set({ ingestionStatus: "READY", failureReason: null, transcriptLang: lang, isGenerated, durationSec })
      .where(eq(t.videos.id, videoId));
  } catch (err) {
    await set("FAILED", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/** YouTube Data API validation (spec FR-5.1); requires YOUTUBE_API_KEY. */
export async function validateYoutubeVideo(youtubeId: string): Promise<
  { ok: true; durationSec: number; title: string } | { ok: false; reason: string }
> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: true, durationSec: 0, title: "" }; // validation skipped without a key; embed errors handled at play time
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails,snippet&id=${encodeURIComponent(youtubeId)}&key=${key}`,
  );
  if (!res.ok) return { ok: false, reason: `YouTube API error ${res.status}` };
  const data = (await res.json()) as {
    items?: Array<{
      status: { embeddable: boolean; privacyStatus: string };
      contentDetails: { duration: string };
      snippet: { title: string };
    }>;
  };
  const item = data.items?.[0];
  if (!item) return { ok: false, reason: "Video not found" };
  if (!item.status.embeddable) return { ok: false, reason: "Owner has disabled embedding" };
  if (!["public", "unlisted"].includes(item.status.privacyStatus)) return { ok: false, reason: `Video is ${item.status.privacyStatus}` };
  const m = item.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durationSec = m ? (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0;
  return { ok: true, durationSec, title: item.snippet.title };
}
