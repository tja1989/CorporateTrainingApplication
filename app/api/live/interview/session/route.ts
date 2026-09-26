import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { learnerLesson } from "@/lib/lms/lesson-access";
import { isLessonLocked } from "@/lib/lms/queries";
import { LiveUnavailableError, liveAvailable, mintLiveToken, resolveLiveModel } from "@/lib/live/gemini";
import { INTERVIEW_DEFAULTS, buildInterviewConfig, maxMinutesFor, mockQuestions } from "@/lib/live/interview";
import { createInterview, getInterview, loadLessonContent } from "@/lib/live/store";
import { InterviewSessionBody, type SessionInfo } from "@/lib/live/shared";

export const maxDuration = 60;

/**
 * Starts (or resumes) an oral check (spec FR-14.2 v1.4). An INTERVIEW lesson
 * runs on its configured scope and must merely be unlocked; a post-lesson
 * check on a VIDEO/TEXT lesson requires that lesson to be complete. Creates the
 * interview + consent rows, then mints a one-use token with the prompt locked in.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const parsed = InterviewSessionBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { lessonId, interviewId: resumeId, resumeHandle } = parsed.data;

  const access = await learnerLesson(user.id, lessonId);
  if (!access) return new Response("Not found", { status: 404 });
  if (access.self.locked) return Response.json({ error: "Complete the earlier course and lesson prerequisites first." }, { status: 403 });
  const loaded = await loadLessonContent(lessonId);
  if (!loaded || loaded.course.status !== "PUBLISHED") return new Response("Not found", { status: 404 });
  if (!loaded.content) return Response.json({ error: "This lesson has no oral-check content yet." }, { status: 409 });

  const isInterviewLesson = loaded.lesson.type === "INTERVIEW";
  const outlineIds = loaded.outline.flatMap((o) => o.lessons.map((l) => l.id));
  const progress = outlineIds.length
    ? await db
        .select({ lessonId: t.lessonProgress.lessonId, status: t.lessonProgress.status })
        .from(t.lessonProgress)
        .where(and(eq(t.lessonProgress.userId, user.id), inArray(t.lessonProgress.lessonId, outlineIds)))
    : [];
  const done = new Set(progress.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId));
  if (isInterviewLesson) {
    if (isLessonLocked(loaded.outline, done, lessonId, loaded.course.sequentialLock)) {
      return Response.json({ error: "Complete the previous lessons first." }, { status: 403 });
    }
  } else if (!done.has(lessonId)) {
    return Response.json({ error: "Finish the lesson first." }, { status: 403 });
  }

  const cfg = loaded.config ?? { ...INTERVIEW_DEFAULTS, scope: "previous" as const };
  const questionCount = cfg.questionCount;
  const passPct = cfg.passPct;
  const maxMinutes = maxMinutesFor(user.timeMultiplier, cfg.maxMinutes);
  const firstName = user.name.split(" ")[0] || "there";
  const config = (handle?: string) =>
    buildInterviewConfig({
      learnerFirstName: firstName,
      courseTitle: loaded.course.title,
      lessonTitle: loaded.lesson.title,
      content: loaded.content!,
      questionCount,
      maxMinutes,
      focus: cfg.focus,
      objectives: loaded.course.objectives,
      resumeHandle: handle,
    });

  // Reconnect to an in-progress interview after goAway/close
  if (resumeId && resumeHandle) {
    const row = await getInterview(resumeId);
    if (!row || row.userId !== user.id || row.state !== "IN_PROGRESS" || row.mock) return new Response("Not found", { status: 404 });
    try {
      const { token, expiresAt } = await mintLiveToken({ model: row.model, config: config(resumeHandle) });
      const info: SessionInfo = { mock: false, model: row.model, token, expiresAt, interviewId: row.id, questionCount, maxMinutes, passPct };
      return Response.json(info);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Could not resume" }, { status: 502 });
    }
  }

  const mock = !liveAvailable();
  let model = "mock";
  let warning: string | undefined;
  if (!mock) {
    try {
      ({ model, warning } = await resolveLiveModel());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Live voice is unavailable";
      return Response.json({ error: message }, { status: err instanceof LiveUnavailableError ? 503 : 502 });
    }
  }
  const interviewId = await createInterview({ userId: user.id, lessonId, courseId: loaded.course.id, model, mock, questionCount, maxMinutes, passPct });
  await db.insert(t.consents).values({ id: id(), userId: user.id, kind: "voice", version: `oral:${interviewId}` });

  if (mock) {
    const info: SessionInfo = { mock: true, model, interviewId, questionCount, maxMinutes, passPct, questions: mockQuestions(loaded.content, questionCount) };
    return Response.json(info);
  }
  try {
    const { token, expiresAt } = await mintLiveToken({ model, config: config() });
    const info: SessionInfo = { mock: false, model, token, expiresAt, warning, interviewId, questionCount, maxMinutes, passPct };
    return Response.json(info);
  } catch (err) {
    await db.update(t.liveInterviews).set({ state: "ABANDONED", completedAt: new Date() }).where(eq(t.liveInterviews.id, interviewId));
    return Response.json({ error: err instanceof Error ? err.message : "Could not start the session" }, { status: 502 });
  }
}
