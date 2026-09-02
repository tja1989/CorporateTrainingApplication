"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { enqueue } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";
import { drain } from "@/lib/jobs/queue";
import { validateYoutubeVideo } from "@/lib/video/ingest";
import { setFlash } from "@/lib/flash";
import { parseInterviewConfig } from "@/lib/live/interview";

export async function createCourseAction(form: FormData): Promise<void> {
  const admin = await requireRole("ADMIN");
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  const courseId = id();
  await db.insert(t.courses).values({
    id: courseId,
    title,
    description: String(form.get("description") ?? ""),
    estMinutes: Number(form.get("estMinutes") ?? 15) || 15,
    status: "DRAFT",
    createdBy: admin.id,
  });
  redirect(`/admin/courses/${courseId}`);
}

export async function updateCourseAction(courseId: string, form: FormData): Promise<void> {
  await requireRole("ADMIN");
  await db
    .update(t.courses)
    .set({
      title: String(form.get("title") ?? "").trim() || undefined,
      description: String(form.get("description") ?? ""),
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
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function setCourseStatusAction(courseId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): Promise<void> {
  await requireRole("ADMIN");
  await db
    .update(t.courses)
    .set({ status, publishedAt: status === "PUBLISHED" ? new Date() : undefined })
    .where(eq(t.courses.id, courseId));
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function addModuleAction(courseId: string, form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  const mods = await db.select().from(t.modules).where(eq(t.modules.courseId, courseId));
  await db.insert(t.modules).values({ id: id(), courseId, title, sort: mods.length });
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function addLessonAction(courseId: string, moduleId: string, form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const type = String(form.get("type") ?? "TEXT") as "TEXT" | "PDF" | "VIDEO" | "QUIZ" | "INTERVIEW";
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
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
    if (!match) return;
    const youtubeId = match[1];
    const check = await validateYoutubeVideo(youtubeId);
    if (!check.ok) throw new Error(`YouTube validation failed: ${check.reason}`);
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
  revalidatePath(`/admin/courses/${courseId}`);
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

export async function retryIngestAction(courseId: string, videoId: string): Promise<void> {
  await requireRole("ADMIN");
  await enqueue("ingest_video", { videoId });
  await drain(handlers, 3);
  revalidatePath(`/admin/courses/${courseId}`);
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
