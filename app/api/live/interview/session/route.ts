import { and, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { LiveUnavailableError, liveAvailable, mintLiveToken, resolveLiveModel } from "@/lib/live/gemini";
import { QUESTION_COUNT, buildInterviewConfig, maxMinutesFor, mockQuestions } from "@/lib/live/interview";
import { createInterview, getInterview, loadLessonContent } from "@/lib/live/store";
import { InterviewSessionBody, type SessionInfo } from "@/lib/live/shared";

export const maxDuration = 60;

/**
 * Starts (or resumes) an oral check (spec FR-14.2). Requires the lesson to be
 * completed and to have interviewable content. Creates the interview + consent
 * rows, then mints a one-use token with the interviewer prompt locked in.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const parsed = InterviewSessionBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { lessonId, interviewId: resumeId, resumeHandle } = parsed.data;

  const loaded = await loadLessonContent(lessonId);
  if (!loaded || loaded.course.status !== "PUBLISHED") return new Response("Not found", { status: 404 });
  if (!loaded.content) return Response.json({ error: "This lesson has no oral check." }, { status: 409 });
  const [progress] = await db
    .select({ status: t.lessonProgress.status })
    .from(t.lessonProgress)
    .where(and(eq(t.lessonProgress.userId, user.id), eq(t.lessonProgress.lessonId, lessonId)))
    .limit(1);
  if (progress?.status !== "COMPLETED") return Response.json({ error: "Finish the lesson first." }, { status: 403 });

  const questionCount = QUESTION_COUNT;
  const maxMinutes = maxMinutesFor(user.timeMultiplier);
  const firstName = user.name.split(" ")[0] || "there";
  const config = (handle?: string) =>
    buildInterviewConfig({
      learnerFirstName: firstName,
      courseTitle: loaded.course.title,
      lessonTitle: loaded.lesson.title,
      content: loaded.content!,
      questionCount,
      maxMinutes,
      resumeHandle: handle,
    });

  // Reconnect to an in-progress interview after goAway/close
  if (resumeId && resumeHandle) {
    const row = await getInterview(resumeId);
    if (!row || row.userId !== user.id || row.state !== "IN_PROGRESS" || row.mock) return new Response("Not found", { status: 404 });
    try {
      const { token, expiresAt } = await mintLiveToken({ model: row.model, config: config(resumeHandle) });
      const info: SessionInfo = { mock: false, model: row.model, token, expiresAt, interviewId: row.id, questionCount, maxMinutes };
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
  const interviewId = await createInterview({ userId: user.id, lessonId, courseId: loaded.course.id, model, mock, questionCount, maxMinutes });
  await db.insert(t.consents).values({ id: id(), userId: user.id, kind: "voice", version: `oral:${interviewId}` });

  if (mock) {
    const info: SessionInfo = { mock: true, model, interviewId, questionCount, maxMinutes, questions: mockQuestions(loaded.content, questionCount) };
    return Response.json(info);
  }
  try {
    const { token, expiresAt } = await mintLiveToken({ model, config: config() });
    const info: SessionInfo = { mock: false, model, token, expiresAt, warning, interviewId, questionCount, maxMinutes };
    return Response.json(info);
  } catch (err) {
    await db.update(t.liveInterviews).set({ state: "ABANDONED", completedAt: new Date() }).where(eq(t.liveInterviews.id, interviewId));
    return Response.json({ error: err instanceof Error ? err.message : "Could not start the session" }, { status: 502 });
  }
}
