"use server";

import type { ActionResult } from "@/components/workspace-form";
import { parseCoverUrl } from "@/lib/workspace-inputs";
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requirePermission, requireUser } from "@/lib/auth/guard";
import { canonicalRole } from "@/lib/auth/roles";
import { id } from "@/lib/ids";
import { enqueue, drain } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";
import { validateYoutubeVideo } from "@/lib/video/ingest";
import { parseSrtVtt } from "@/lib/video/transcript";
import { setFlash } from "@/lib/flash";
import { parseInterviewConfig } from "@/lib/live/interview";
import { mutateDraftCourse, transitionCourse } from "@/lib/courses/workflow";
import { canAuthorCourse, courseWorkspacePath } from "@/lib/courses/ownership";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";
import type { WorkflowInput } from "@/lib/courses/approval-policy";
import { parseCoursePlanning } from "@/lib/courses/planning";
import { saveCoursePlanning } from "@/lib/courses/planning-service";
import { parseQuizSettingsInput } from "@/lib/courses/quiz-settings-input";

function errorResult(error: unknown): ActionResult {
  return {
    error:
      error instanceof Error
        ? error.message
        : "Could not save. Reload and try again.",
  };
}
function revision(form?: FormData): number | undefined {
  return form?.has("revision") ? Number(form.get("revision")) : undefined;
}
function refresh(courseId: string) {
  for (const root of ["admin", "hr", "department", "instructor"])
    revalidatePath(`/${root}/courses/${courseId}`);
  revalidatePath(`/course/${courseId}`);
}
async function assignment(
  tx: LearningTransaction,
  departmentId: string | null,
  instructorId: string | null,
) {
  if (departmentId) {
    const [department] = await tx
      .select()
      .from(t.departments)
      .where(eq(t.departments.id, departmentId))
      .limit(1);
    if (!department) throw new Error("Department not found.");
  }
  if (instructorId) {
    const [person] = await tx
      .select()
      .from(t.users)
      .where(eq(t.users.id, instructorId))
      .limit(1);
    if (
      !person ||
      person.erasedAt ||
      person.passwordState !== "ACTIVE" ||
      canonicalRole(person.role) !== "INSTRUCTOR"
    )
      throw new Error("Choose an active Instructor.");
  }
}
async function courseLesson(
  tx: LearningTransaction,
  courseId: string,
  lessonId: string,
) {
  const [row] = await tx
    .select({ lesson: t.lessons })
    .from(t.lessons)
    .innerJoin(t.modules, eq(t.lessons.moduleId, t.modules.id))
    .where(and(eq(t.lessons.id, lessonId), eq(t.modules.courseId, courseId)))
    .limit(1);
  if (!row) throw new Error("This lesson does not belong to this course.");
  return row.lesson;
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

export async function createCourseAction(
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Enter a title." };
  if (
    actor.role === "INSTRUCTOR" &&
    form.get("instructorId") &&
    form.get("instructorId") !== actor.id
  )
    return { error: "You cannot assign another Instructor to your draft." };
  const departmentId =
    actor.role === "INSTRUCTOR"
      ? actor.departmentId
      : String(form.get("departmentId") ?? "") || null;
  const instructorId =
    actor.role === "INSTRUCTOR"
      ? actor.id
      : String(form.get("instructorId") ?? "") || null;
  try {
    const courseId = id();
    await db.transaction(async (tx) => {
      await assignment(tx, departmentId, instructorId);
      await tx
        .insert(t.courses)
        .values({
          id: courseId,
          title,
          description: String(form.get("description") ?? ""),
          estMinutes: Number(form.get("estMinutes") ?? 15) || 15,
          status: "DRAFT",
          createdBy: actor.id,
          departmentId,
          instructorId,
        });
    });
    return { href: courseWorkspacePath(actor, courseId) };
  } catch (error) {
    return errorResult(error);
  }
}
export async function updateCourseAction(
  courseId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  const cover = parseCoverUrl(String(form.get("coverUrl") ?? ""));
  if (cover.error) return { error: cover.error };
  const minutes = Number(form.get("estMinutes")),
    validity = form.get("certificateValidityDays")
      ? Number(form.get("certificateValidityDays"))
      : null;
  if (!Number.isInteger(minutes) || minutes < 1)
    return { error: "Estimated minutes must be a positive whole number." };
  if (validity !== null && (!Number.isInteger(validity) || validity < 1))
    return {
      error: "Certificate validity must be a positive whole number, or blank.",
    };
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Enter a course title." };
  try {
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const [course] = await tx
          .select()
          .from(t.courses)
          .where(eq(t.courses.id, courseId))
          .limit(1);
        const departmentId = form.has("departmentId")
          ? String(form.get("departmentId") ?? "") || null
          : course.departmentId;
        const instructorId = form.has("instructorId")
          ? String(form.get("instructorId") ?? "") || null
          : course.instructorId;
        if (
          actor.role === "INSTRUCTOR" &&
          (instructorId !== actor.id || departmentId !== course.departmentId)
        )
          throw new Error("Only HR or Super Admin can reassign this course.");
        await assignment(tx, departmentId, instructorId);
        if (form.has("planningFields")) {
          await saveCoursePlanning(tx, courseId, parseCoursePlanning({
            startDate: String(form.get("startDate") ?? ""),
            endDate: String(form.get("endDate") ?? ""),
            folderPath: String(form.get("folderPath") ?? ""),
            prerequisiteIds: form.getAll("prerequisiteIds").map(String),
          }));
        }
        await tx
          .update(t.courses)
          .set({
            title,
            description: String(form.get("description") ?? ""),
            coverUrl: cover.value,
            language: String(form.get("language") ?? "en").trim() || "en",
            estMinutes: minutes,
            certificateEnabled: form.get("certificateEnabled") === "on",
            certificateValidityDays: validity,
            tags: String(form.get("tags") ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            departmentId,
            instructorId,
          })
          .where(eq(t.courses.id, courseId));
      },
      revision(form),
    );
    await setFlash(
      "Course settings saved. Approval is required for this revision.",
    );
    refresh(courseId);
    return { success: "Course settings saved." };
  } catch (error) {
    return errorResult(error);
  }
}
export async function workflowAction(
  courseId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireUser();
  try {
    await transitionCourse(actor, {
      courseId,
      action: String(form.get("action")) as WorkflowInput["action"],
      revision: Number(form.get("revision")),
      requestId: String(form.get("requestId") ?? ""),
      comment: String(form.get("comment") ?? ""),
      overrideState:
        (form.get("overrideState") as WorkflowInput["overrideState"]) ??
        undefined,
      overridePublication:
        (form.get(
          "overridePublication",
        ) as WorkflowInput["overridePublication"]) ?? undefined,
    });
    refresh(courseId);
    return { success: "Course workflow updated." };
  } catch (error) {
    return errorResult(error);
  }
}
/** Kept for compatibility with old clients; the audited policy remains authoritative. */
export async function setCourseStatusAction(
  courseId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
): Promise<ActionResult> {
  const actor = await requireUser();
  if(!["DRAFT","PUBLISHED","ARCHIVED"].includes(status))return {error:"Choose a valid publication state."};
  const [course] = await db
    .select()
    .from(t.courses)
    .where(eq(t.courses.id, courseId))
    .limit(1);
  if (!course) return { error: "Course not found." };
  try {
    await transitionCourse(actor, {
      courseId,
      action:
        status === "PUBLISHED"
          ? "publish"
          : status === "ARCHIVED"
            ? "archive"
            : "revise",
      revision: course.contentRevision,
      requestId: id(),
      comment: "",
    });
    refresh(courseId);
    return { success: "Course workflow updated." };
  } catch (error) {
    return errorResult(error);
  }
}
export async function addModuleAction(
  courseId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Enter a module title." };
  try {
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const mods = await tx
          .select()
          .from(t.modules)
          .where(eq(t.modules.courseId, courseId));
        await tx
          .insert(t.modules)
          .values({ id: id(), courseId, title, sort: mods.length });
      },
      revision(form),
    );
    refresh(courseId);
    return { success: "Module added." };
  } catch (error) {
    return errorResult(error);
  }
}
export async function addLessonAction(
  courseId: string,
  moduleId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  const type = String(
      form.get("type") ?? "TEXT",
    ) as typeof t.lessons.$inferSelect.type,
    title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Enter a lesson title." };
  if (!["TEXT", "PDF", "VIDEO", "QUIZ", "INTERVIEW"].includes(type))
    return { error: "Choose a supported lesson type." };
  if (type === "TEXT" && !String(form.get("body") ?? "").trim())
    return { error: "Add the lesson content." };
  if (type === "PDF") {
    const file = parseCoverUrl(String(form.get("fileUrl") ?? ""));
    if (file.error || !file.value)
      return { error: "Enter a local path or HTTPS URL for the PDF." };
  }
  if (
    type === "QUIZ" &&
    (!form.get("bankId") ||
      !Number.isInteger(Number(form.get("pickN"))) ||
      Number(form.get("pickN")) < 1)
  )
    return { error: "Choose a question bank and a positive question count." };
  let youtubeId = "",
    check: { durationSec: number; title: string } | undefined;
  if (type === "VIDEO") {
    const [course] = await db
      .select()
      .from(t.courses)
      .where(eq(t.courses.id, courseId))
      .limit(1);
    if (!course || !canAuthorCourse(actor, course))
      return { error: "You cannot edit this course." };
    const url = String(form.get("youtubeUrl") ?? "");
    const match =
      url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{6,20})/) ??
      url.match(/^([\w-]{6,20})$/);
    if (!match) return { error: "Enter a valid YouTube URL or video ID." };
    youtubeId = match[1];
    const result = await validateYoutubeVideo(youtubeId);
    if (!result.ok)
      return { error: `YouTube validation failed: ${result.reason}.` };
    check = result;
  }
  try {
    let queued = false;
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const [module] = await tx
          .select()
          .from(t.modules)
          .where(
            and(eq(t.modules.id, moduleId), eq(t.modules.courseId, courseId)),
          )
          .limit(1);
        if (!module)
          throw new Error(
            "This module does not belong to this course. Reload and try again.",
          );
        const lessons = await tx
          .select()
          .from(t.lessons)
          .where(eq(t.lessons.moduleId, moduleId));
        const lessonId = id();
        let payload: typeof t.lessons.$inferSelect.payload = {};
        if (type === "TEXT") payload = { body: String(form.get("body") ?? "") };
        if (type === "PDF")
          payload = { fileUrl: String(form.get("fileUrl") ?? "") };
        if (type === "INTERVIEW")
          payload = { interview: interviewConfigFromForm(form) };
        if (type === "QUIZ") {
          const bankId = String(form.get("bankId"));
          const [bank] = await tx
            .select()
            .from(t.questionBanks)
            .where(eq(t.questionBanks.id, bankId))
            .limit(1);
          if (
            !bank ||
            (actor.role === "INSTRUCTOR" &&
              bank.courseId &&
              bank.courseId !== courseId)
          )
            throw new Error("This question bank is outside your course.");
          const { DEFAULT_SETTINGS } = await import("@/lib/quiz/engine");
          const quizId = id();
          await tx
            .insert(t.quizzes)
            .values({
              id: quizId,
              lessonId,
              title,
              settings: {
                ...DEFAULT_SETTINGS,
                feedbackMode: form.get("exam") === "on" ? "EXAM" : "PRACTICE",
                integrityMode: form.get("integrity") === "on",
              },
              sections: [{ bankId, pickN: Number(form.get("pickN")) }],
            });
          payload = { quizId };
        }
        if (type === "VIDEO") {
          let [video] = await tx
            .select()
            .from(t.videos)
            .where(eq(t.videos.youtubeId, youtubeId))
            .limit(1);
          if (!video) {
            const videoId = id(),
              rawTranscript = String(form.get("transcript") ?? "").trim();
            if (rawTranscript && !parseSrtVtt(rawTranscript).length)
              throw new Error("Use a valid SRT or VTT transcript.");
            [video] = await tx
              .insert(t.videos)
              .values({
                id: videoId,
                youtubeId,
                title: check!.title || title,
                durationSec: check!.durationSec,
                transcriptSource: rawTranscript ? "manual" : "vendor",
                ingestionStatus: "PENDING",
              })
              .returning();
            const [course] = await tx
              .select()
              .from(t.courses)
              .where(eq(t.courses.id, courseId))
              .limit(1);
            await enqueue(
              "ingest_video",
              {
                videoId,
                provider: rawTranscript ? "manual" : "vendor",
                rawTranscript: rawTranscript || undefined,
                courseId,
                revision: course.contentRevision + 1,
              },
              0,
              tx,
            );
            queued = true;
          }
          payload = { videoId: video.id };
        }
        await tx
          .insert(t.lessons)
          .values({
            id: lessonId,
            moduleId,
            type,
            title,
            sort: lessons.length,
            payload,
            searchText: payload.body ?? null,
          });
      },
      revision(form),
    );
    if (queued) await drain(handlers, 3);
    refresh(courseId);
    return { success: "Lesson added." };
  } catch (error) {
    return errorResult(error);
  }
}
/** Correct an existing text/PDF lesson without replacing its learning identity. */
export async function updateContentLessonAction(courseId: string, lessonId: string, form: FormData): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  try {
    await mutateDraftCourse(actor, courseId, async (tx) => {
      const lesson = await courseLesson(tx, courseId, lessonId);
      if (!["TEXT", "PDF"].includes(lesson.type)) throw new Error("This lesson does not support text or PDF editing.");
      const title = String(form.get("title") ?? "").trim();
      if (!title) throw new Error("Enter a lesson title.");
      const body = String(form.get("body") ?? "");
      const file = parseCoverUrl(String(form.get("fileUrl") ?? ""));
      if (lesson.type === "TEXT" && !body.trim()) throw new Error("Add the lesson content.");
      if (lesson.type === "PDF" && (file.error || !file.value)) throw new Error("Enter a local path or HTTPS URL for the PDF.");
      await tx.update(t.lessons).set({title, payload: {...lesson.payload, ...(lesson.type === "TEXT" ? {body} : {fileUrl: file.value!})}, searchText: lesson.type === "TEXT" ? body : null}).where(eq(t.lessons.id, lessonId));
    }, revision(form));
    refresh(courseId);return {success: "Lesson content saved. Submit this revision for approval."};
  } catch (error) { return errorResult(error); }
}
export async function updateQuizLessonAction(
  courseId: string,
  lessonId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  const parsed = parseQuizSettingsInput({
    bankId: String(form.get("bankId") ?? ""),
    pickN: String(form.get("pickN") ?? ""),
    passPct: String(form.get("passPct") ?? ""),
    attemptsLimit: String(form.get("attemptsLimit") ?? ""),
    timeLimitMinutes: String(form.get("timeLimitMinutes") ?? ""),
    exam: form.get("exam") === "on",
    integrity: form.get("integrity") === "on",
  });
  if ("error" in parsed) return parsed;
  const settings = parsed.value;
  try {
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const lesson = await courseLesson(tx, courseId, lessonId);
        if (lesson.type !== "QUIZ" || !lesson.payload.quizId)
          throw new Error("This lesson is not a quiz.");
        const [bank] = await tx
          .select()
          .from(t.questionBanks)
          .where(eq(t.questionBanks.id, settings.bankId))
          .limit(1);
        if (
          !bank ||
          (actor.role === "INSTRUCTOR" &&
            bank.courseId &&
            bank.courseId !== courseId)
        )
          throw new Error("This question bank is outside your course.");
        const [quiz] = await tx
          .select()
          .from(t.quizzes)
          .where(eq(t.quizzes.id, lesson.payload.quizId))
          .limit(1);
        if (!quiz) throw new Error("This quiz is missing. Reload and try again.");
        const title = String(form.get("title") ?? "").trim() || lesson.title;
        await tx.update(t.lessons).set({ title }).where(eq(t.lessons.id, lessonId));
        await tx
          .update(t.quizzes)
          .set({
            title,
            settings: {
              ...quiz.settings,
              passPct: settings.passPct,
              attemptsLimit: settings.attemptsLimit,
              timeLimitSec: settings.timeLimitSec,
              feedbackMode: settings.feedbackMode,
              integrityMode: settings.integrityMode,
            },
            // Fixed questions stay; the random draw is replaced.
            sections: [
              ...quiz.sections.filter((s) => s.fixed?.length),
              { bankId: settings.bankId, pickN: settings.pickN },
            ],
          })
          .where(eq(t.quizzes.id, quiz.id));
      },
      revision(form),
    );
    refresh(courseId);
    return { success: "Quiz settings saved." };
  } catch (error) {
    return errorResult(error);
  }
}
export async function updateInterviewLessonAction(
  courseId: string,
  lessonId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  try {
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const lesson = await courseLesson(tx, courseId, lessonId);
        if (lesson.type !== "INTERVIEW")
          throw new Error("This lesson is not an oral check.");
        await tx
          .update(t.lessons)
          .set({
            title: String(form.get("title") ?? "").trim() || lesson.title,
            payload: { interview: interviewConfigFromForm(form) },
          })
          .where(eq(t.lessons.id, lessonId));
      },
      revision(form),
    );
    refresh(courseId);
    return { success: "Oral check settings saved." };
  } catch (error) {
    return errorResult(error);
  }
}
export async function retryIngestAction(
  courseId: string,
  videoId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  try {
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const lessons = await tx
          .select({ id: t.lessons.id })
          .from(t.lessons)
          .innerJoin(t.modules, eq(t.lessons.moduleId, t.modules.id))
          .where(
            and(
              eq(t.modules.courseId, courseId),
              sql`${t.lessons.payload}->>'videoId'=${videoId}`,
            ),
          );
        if (!lessons.length)
          throw new Error("This video does not belong to this course.");
        const [video] = await tx
          .select()
          .from(t.videos)
          .where(eq(t.videos.id, videoId))
          .limit(1);
        if (!video) throw new Error("This video is no longer available.");
        const other = await tx
          .select({ id: t.courses.id })
          .from(t.courses)
          .innerJoin(t.modules, eq(t.modules.courseId, t.courses.id))
          .innerJoin(t.lessons, eq(t.lessons.moduleId, t.modules.id))
          .where(
            and(
              sql`${t.lessons.payload}->>'videoId'=${videoId}`,
              sql`${t.courses.id}<>${courseId}`,
            ),
          );
        if (other.length)
          throw new Error(
            "This video is shared by another course. Its transcript cannot be replaced here.",
          );
        let rawTranscript = String(form.get("transcript") ?? "").trim();
        if (!rawTranscript && video.transcriptSource === "manual") {
          const [previous] = await tx
            .select()
            .from(t.jobs)
            .where(
              and(
                eq(t.jobs.kind, "ingest_video"),
                sql`${t.jobs.payload}->>'videoId'=${videoId}`,
                sql`coalesce(${t.jobs.payload}->>'rawTranscript','')<>''`,
              ),
            )
            .orderBy(desc(t.jobs.createdAt))
            .limit(1);
          rawTranscript = String(previous?.payload.rawTranscript ?? "");
        }
        if (rawTranscript && !parseSrtVtt(rawTranscript).length)
          throw new Error(
            "Use a valid SRT or VTT transcript with timestamps and caption text.",
          );
        if (!rawTranscript && video.transcriptSource !== "vendor")
          throw new Error("Add an SRT or VTT transcript to retry this video.");
        const provider = rawTranscript ? "manual" : "vendor";
        await tx
          .update(t.videos)
          .set({
            transcriptSource: provider,
            ingestionStatus: "PENDING",
            failureReason: null,
          })
          .where(eq(t.videos.id, videoId));
        const [course] = await tx
          .select()
          .from(t.courses)
          .where(eq(t.courses.id, courseId))
          .limit(1);
        await enqueue(
          "ingest_video",
          {
            videoId,
            provider,
            rawTranscript: rawTranscript || undefined,
            courseId,
            revision: course.contentRevision + 1,
          },
          0,
          tx,
        );
      },
      revision(form),
    );
    await drain(handlers, 3);
    refresh(courseId);
    const [video] = await db
      .select()
      .from(t.videos)
      .where(eq(t.videos.id, videoId))
      .limit(1);
    if (video?.ingestionStatus === "FAILED")
      return {
        error:
          "Video processing failed. Check the transcript or retry when the transcript service is available.",
      };
    return {
      success:
        video?.ingestionStatus === "READY"
          ? "Video transcript is ready."
          : "Video queued for processing. Refresh to check progress.",
    };
  } catch (error) {
    return errorResult(error);
  }
}
export async function moveModuleAction(
  courseId: string,
  moduleId: string,
  dir: number,
  form?: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  if (dir !== -1 && dir !== 1) return { error: "Choose a valid direction." };
  try {
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const modules = (
          await tx
            .select()
            .from(t.modules)
            .where(eq(t.modules.courseId, courseId))
        ).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
        const index = modules.findIndex((m) => m.id === moduleId);
        if (index < 0)
          throw new Error("This module does not belong to this course.");
        if (!modules[index + dir]) return;
        [modules[index], modules[index + dir]] = [
          modules[index + dir],
          modules[index],
        ];
        for (let sort = 0; sort < modules.length; sort++)
          if (modules[sort].sort !== sort)
            await tx
              .update(t.modules)
              .set({ sort })
              .where(eq(t.modules.id, modules[sort].id));
      },
      revision(form),
    );
    refresh(courseId);
    return { success: "Module order saved." };
  } catch (error) {
    return errorResult(error);
  }
}
export async function moveLessonAction(
  courseId: string,
  lessonId: string,
  dir: number,
  form?: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("course.author");
  if (dir !== -1 && dir !== 1) return { error: "Choose a valid direction." };
  try {
    await mutateDraftCourse(
      actor,
      courseId,
      async (tx) => {
        const lesson = await courseLesson(tx, courseId, lessonId);
        const siblings = (
          await tx
            .select()
            .from(t.lessons)
            .where(eq(t.lessons.moduleId, lesson.moduleId))
        ).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
        const index = siblings.findIndex((l) => l.id === lessonId);
        if (!siblings[index + dir]) return;
        [siblings[index], siblings[index + dir]] = [
          siblings[index + dir],
          siblings[index],
        ];
        for (let sort = 0; sort < siblings.length; sort++)
          if (siblings[sort].sort !== sort)
            await tx
              .update(t.lessons)
              .set({ sort })
              .where(eq(t.lessons.id, siblings[sort].id));
      },
      revision(form),
    );
    refresh(courseId);
    return { success: "Lesson order saved." };
  } catch (error) {
    return errorResult(error);
  }
}
