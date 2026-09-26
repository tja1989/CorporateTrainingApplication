import { learnerLesson } from "@/lib/lms/lesson-access";
import { currentUser } from "@/lib/auth/guard";
import { liveAvailable, logLiveUsage } from "@/lib/live/gemini";
import { EvaluationSchema, mockEvaluate } from "@/lib/live/interview";
import { appendInterviewTurns, completeInterview, finishInterview, getInterview, loadLessonContent } from "@/lib/live/store";
import { INTERVIEW_TOOL_NAMES, InterviewEventBody } from "@/lib/live/shared";

export const maxDuration = 60;

/**
 * Oral-check events (spec FR-14.2): transcript turns, the model's
 * submit_evaluation tool call, the offline grader, and session end (which
 * grades leftover transcripts by fallback and flags them for review).
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const parsed = InterviewEventBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const body = parsed.data;
  const row = await getInterview(body.interviewId);
  if (!row || row.userId !== user.id) return new Response("Not found", { status: 404 });

  switch (body.type) {
    case "turn": {
      // Turns can legitimately arrive after submit_evaluation (the closing sentence, the final flush)
      await appendInterviewTurns(row.id, body.turns.map((x) => ({ role: x.role, text: x.text, at: x.at, mock: x.mock })));
      return Response.json({ ok: true });
    }
    case "tool": {
      if (!(INTERVIEW_TOOL_NAMES as readonly string[]).includes(body.name)) return new Response("Unknown tool", { status: 400 });
      const evaluation = EvaluationSchema.safeParse(body.args);
      if (!evaluation.success) {
        return Response.json({
          response: { recorded: false, error: `Invalid evaluation: ${evaluation.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}. Call submit_evaluation again with every field.` },
        });
      }
      const result = await completeInterview(row.id, evaluation.data, row.mock ? "mock" : "model");
      return Response.json({ response: { recorded: true, score_pct: result.pct, outcome: result.outcome } });
    }
    case "mock_evaluate": {
      if (!row.mock) return new Response("Not a demo session", { status: 400 });
      const loaded = await loadLessonContent(row.lessonId);
      const content = loaded?.content ?? { title: "lesson", text: "", source: "text" as const };
      const evaluation = mockEvaluate(content, body.qa);
      const result = await completeInterview(row.id, evaluation, "mock");
      return Response.json({ ok: true, ...result, evaluation });
    }
    case "end": {
      const finished = await finishInterview(row.id);
      const outline = finished?.state === "COMPLETED" ? (await learnerLesson(user.id, row.lessonId))?.view : undefined;
      if (body.usage && !row.mock && liveAvailable()) await logLiveUsage("oral_check", body.model ?? row.model, body.usage, body.durationMs ?? 0);
      return Response.json({
        ok: true,
        outline,
        state: finished?.state ?? row.state,
        outcome: finished?.outcome ?? null,
        scorePct: finished?.scorePct ?? null,
        evaluation: finished?.evaluation ?? null,
        evaluationSource: finished?.evaluationSource ?? null,
      });
    }
  }
}
