import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { learnerLesson } from "@/lib/lms/lesson-access";
import { flatLessons } from "@/lib/lms/outline";
import type { TutorCitation } from "@/lib/db/schema";

export type TutorSource = { videoId: string; lessonId: string; lessonTitle: string; durationSec: number };

export async function allowedTutorSources(userId: string, lessonId: string) {
  const access = await learnerLesson(userId, lessonId);
  if (!access || access.self.locked || access.lesson.type !== "VIDEO") return null;
  const allowed = flatLessons(access.view).filter(l => !l.locked && l.type === "VIDEO").map(l => l.id);
  const lessons = allowed.length ? await db.select().from(t.lessons).where(inArray(t.lessons.id, allowed)) : [];
  const videoIds = lessons.flatMap(l => l.payload.videoId ? [l.payload.videoId] : []);
  const videos = videoIds.length ? await db.select().from(t.videos).where(inArray(t.videos.id, videoIds)) : [];
  const sources: TutorSource[] = lessons.flatMap(l => {
    const video = videos.find(v => v.id === l.payload.videoId && v.ingestionStatus === "READY");
    return video ? [{ videoId: video.id, lessonId: l.id, lessonTitle: l.title, durationSec: video.durationSec }] : [];
  });
  return { access, sources };
}

/** Stored/model destinations are never trusted: resolve against this user's allowed course sources. */
export function resolveTutorCitations(citations: TutorCitation[], sources: TutorSource[]): TutorCitation[] {
  return citations.map(c => {
    const source = sources.find(s => s.videoId === c.videoId);
    const safe = { startSec: c.startSec, endSec: c.endSec, quote: c.quote, videoId: c.videoId };
    if (!source || !Number.isFinite(c.startSec) || c.startSec < 0 || c.startSec >= source.durationSec) return safe;
    return { ...safe, lessonId: source.lessonId, lessonTitle: source.lessonTitle };
  });
}
