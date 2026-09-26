"use server";

import type { ActionResult } from "@/components/workspace-form";
import { parseCoverUrl } from "@/lib/workspace-inputs";
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { enqueue } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";
import { drain } from "@/lib/jobs/queue";
import { validateYoutubeVideo } from "@/lib/video/ingest";
import { parseSrtVtt } from "@/lib/video/transcript";
import { setFlash } from "@/lib/flash";
import { parseInterviewConfig } from "@/lib/live/interview";

export async function createCourseAction(form: FormData): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Enter a title." };
  const courseId = id();
  await db.insert(t.courses).values({
    id: courseId,
    title,
    description: String(form.get("description") ?? ""),
    estMinutes: Number(form.get("estMinutes") ?? 15) || 15,
    status: "DRAFT",
    createdBy: admin.id,
  });
  return { href: `/admin/courses/${courseId}` };
}

export async function updateCourseAction(courseId: string, form: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const cover = parseCoverUrl(String(form.get("coverUrl") ?? ""));
  if (cover.error) return { error: cover.error };
  const minutes = Number(form.get("estMinutes"));
  const validity = form.get("certificateValidityDays") ? Number(form.get("certificateValidityDays")) : null;
  if (!Number.isInteger(minutes) || minutes < 1) return { error: "Estimated minutes must be a positive whole number." };
  if (validity !== null && (!Number.isInteger(validity) || validity < 1)) return { error: "Certificate validity must be a positive whole number, or blank." };
  if (!String(form.get("title") ?? "").trim()) return { error: "Enter a course title." };
  await db
    .update(t.courses)
    .set({
      title: String(form.get("title") ?? "").trim() || undefined,
      description: String(form.get("description") ?? ""),
      coverUrl: cover.value,
      language: String(form.get("language") ?? "en").trim() || "en",
      estMinutes: Number(form.get("estMinutes") ?? 15) || 15,
      sequentialLock: form.get("sequentialLock") === "on",
      certificateEnabled: form.get("certificateEnabled") === "on",
      certificateValidityDays: form.get("certificateValidityDays") ? Number(form.get("certificateValidityDays")) : null,
      tags: String(form.get("tags") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    })
    .where(eq(t.courses.id, courseId));
  await setFlash("Course settings saved.");
  revalidatePath(`/admin/courses/${courseId}`);
  return { success: "Course settings saved." };
}

export async function setCourseStatusAction(courseId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): Promise<void> {
  await requireRole("ADMIN");
  await db
    .update(t.courses)
    .set({ status, publishedAt: status === "PUBLISHED" ? new Date() : undefined })
    .where(eq(t.courses.id, courseId));
  await setFlash(status === "PUBLISHED" ? "Course published. Learners can now open it." : "Course moved to draft.");
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function addModuleAction(courseId: string, form: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Enter a module title." };
  const mods = await db.select().from(t.modules).where(eq(t.modules.courseId, courseId));
  await db.insert(t.modules).values({ id: id(), courseId, title, sort: mods.length });
  await setFlash("Module added.");
  revalidatePath(`/admin/courses/${courseId}`);
  return { success: "Module added." };
}

export async function addLessonAction(courseId: string, moduleId: string, form: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const type = String(form.get("type") ?? "TEXT") as "TEXT" | "PDF" | "VIDEO" | "QUIZ" | "INTERVIEW";
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Enter a lesson title." };
  const [module] = await db.select().from(t.modules).where(eq(t.modules.id, moduleId)).limit(1);
  if (!module || module.courseId !== courseId) return { error: "This module does not belong to this course. Reload and try again." };
  if (!["TEXT", "PDF", "VIDEO", "QUIZ", "INTERVIEW"].includes(type)) return { error: "Choose a supported lesson type." };
  if (type === "TEXT" && !String(form.get("body") ?? "").trim()) return { error: "Add the lesson content." };
  if (type === "PDF") {
    const file = parseCoverUrl(String(form.get("fileUrl") ?? ""));
    if (file.error || !file.value) return { error: "Enter a local path or HTTPS URL for the PDF." };
  }
  if (type === "QUIZ" && (!form.get("bankId") || !Number.isInteger(Number(form.get("pickN"))) || Number(form.get("pickN")) < 1)) return { error: "Choose a question bank and a positive question count." };
  const lessons = await db.select().from(t.lessons).where(eq(t.lessons.moduleId, moduleId));
  const lessonId = id();

  if (type === "TEXT") {
    const body = String(form.get("body") ?? "");
    await db.insert(t.lessons).values({ id: lessonId, moduleId, type, title, sort: lessons.length, payload: { body }, searchText: body });
  } else if (type === "PDF") {
    await db.insert(t.lessons).values({ id: lessonId, moduleId, type, title, sort: lessons.length, payload: { fileUrl: String(form.get("fileUrl") ?? "") } });
  } else if (type === "VIDEO") {
    const url = String(form.get("youtubeUrl") ?? "");
    const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{6,20})/) ?? url.match(/^([\w-]{6,20})$/);
    if (!match) return { error: "Enter a valid YouTube URL or video ID." };
    const youtubeId = match[1];
    const check = await validateYoutubeVideo(youtubeId);
    if (!check.ok) return { error: `YouTube validation failed: ${check.reason}. Check the video and try again.` };
    const [existingVideo] = await db.select().from(t.videos).where(eq(t.videos.youtubeId, youtubeId)).limit(1);
    if (existingVideo) {
      await db.insert(t.lessons).values({ id: lessonId, moduleId, type, title, sort: lessons.length, payload: { videoId: existingVideo.id } });
      await setFlash("Lesson added using the existing video and transcript.");
      revalidatePath(`/admin/courses/${courseId}`);
      return { success: "Existing video added to this module." };
    }
    const videoId = id();
    await db.insert(t.videos).values({
      id: videoId,
      youtubeId,
      title: check.title || title,
      durationSec: check.durationSec,
      transcriptSource: form.get("transcript") ? "manual" : "vendor",
      ingestionStatus: "PENDING",
    });
    await db.insert(t.lessons).values({ id: lessonId, moduleId, type, title, sort: lessons.length, payload: { videoId } });
    const rawTranscript = String(form.get("transcript") ?? "").trim();
    await enqueue("ingest_video", {
      videoId,
      provider: rawTranscript ? "manual" : "vendor",
      rawTranscript: rawTranscript || undefined,
    });
    // process inline so the admin sees status without a separate worker in dev
    await drain(handlers, 3);
  } else if (type === "QUIZ") {
    const { DEFAULT_SETTINGS } = await import("@/lib/quiz/engine");
    const bankId = String(form.get("bankId") ?? "");
    const pickN = Number(form.get("pickN") ?? 5) || 5;
    const quizId = id();
    await db.insert(t.quizzes).values({
      id: quizId,
      lessonId: null,
      title,
      settings: { ...DEFAULT_SETTINGS, feedbackMode: form.get("exam") === "on" ? "EXAM" : "PRACTICE", integrityMode: form.get("integrity") === "on" },
      sections: bankId ? [{ bankId, pickN }] : [],
    });
    await db.insert(t.lessons).values({ id: lessonId, moduleId, type, title, sort: lessons.length, payload: { quizId } });
    await db.update(t.quizzes).set({ lessonId }).where(eq(t.quizzes.id, quizId));
  } else if (type === "INTERVIEW") {
    await db.insert(t.lessons).values({ id: lessonId, moduleId, type, title, sort: lessons.length, payload: { interview: interviewConfigFromForm(form) } });
  }
  await setFlash("Lesson added.");
  revalidatePath(`/admin/courses/${courseId}`);
  return { success: "Lesson added." };
}

function interviewConfigFromForm(form: FormData) {
  return parseInterviewConfig({
    questionCount: form.get("questionCount"),
    passPct: form.get("passPct"),
    maxMinutes: form.get("maxMinutes"),
    scope: form.get("scope"),
    focus: form.get("focus"),
    requirePass: form.get("requirePass"),
  });
}

/** Edits an INTERVIEW lesson's oral-check settings (spec FR-14.2 v1.4). */
export async function updateInterviewLessonAction(courseId: string, lessonId: string, form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson || lesson.type !== "INTERVIEW") return;
  const title = String(form.get("title") ?? "").trim();
  await db
    .update(t.lessons)
    .set({ title: title || lesson.title, payload: { interview: interviewConfigFromForm(form) } })
    .where(eq(t.lessons.id, lessonId));
  await setFlash("Oral check settings saved.");
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function retryIngestAction(courseId: string, videoId: string, form: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const [video] = await db.select().from(t.videos).where(eq(t.videos.id, videoId)).limit(1);
  if (!video) return { error: "This video is no longer available. Reload the course." };
  let rawTranscript = String(form.get("transcript") ?? "").trim();
  if (!rawTranscript && video.transcriptSource === "manual") {
    const [previous] = await db.select().from(t.jobs).where(and(
      eq(t.jobs.kind, "ingest_video"),
      sql`${t.jobs.payload}->>'videoId' = ${videoId}`,
      sql`coalesce(${t.jobs.payload}->>'rawTranscript', '') <> ''`,
    )).orderBy(desc(t.jobs.createdAt)).limit(1);
    rawTranscript = String(previous?.payload.rawTranscript ?? "");
  }
  if (rawTranscript && !parseSrtVtt(rawTranscript).length) return { error: "Use a valid SRT or VTT transcript with timestamps and caption text. Your entry is still here." };
  if (!rawTranscript && video.transcriptSource !== "vendor") return { error: "Add an SRT or VTT transcript to retry this video." };
  const provider = rawTranscript ? "manual" : "vendor";
  await db.update(t.videos).set({ transcriptSource: provider, ingestionStatus: "PENDING", failureReason: null }).where(eq(t.videos.id, videoId));
  await enqueue("ingest_video", { videoId, provider, rawTranscript: rawTranscript || undefined });
  await drain(handlers, 3);
  const [updated] = await db.select().from(t.videos).where(eq(t.videos.id, videoId)).limit(1);
  if (updated?.ingestionStatus === "FAILED") return { error: "Ingestion failed. Check the transcript or try again when the transcript service is available. Your entry is still here." };
  await setFlash(updated?.ingestionStatus === "READY" ? "Video transcript is ready." : "Video ingestion queued. Refresh to check its progress.");
  revalidatePath(`/admin/courses/${courseId}`);
  return { success: "Video ingestion retried." };
}

export async function moveLessonAction(courseId: string, lessonId: string, dir: number): Promise<void> {
  await requireRole("ADMIN");
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson) return;
  const siblings = (await db.select().from(t.lessons).where(eq(t.lessons.moduleId, lesson.moduleId))).sort((a, b) => a.sort - b.sort);
  const idx = siblings.findIndex((l) => l.id === lessonId);
  const swap = siblings[idx + dir];
  if (!swap) return;
  await db.update(t.lessons).set({ sort: swap.sort }).where(eq(t.lessons.id, lesson.id));
  await db.update(t.lessons).set({ sort: lesson.sort }).where(eq(t.lessons.id, swap.id));
  revalidatePath(`/admin/courses/${courseId}`);
}
