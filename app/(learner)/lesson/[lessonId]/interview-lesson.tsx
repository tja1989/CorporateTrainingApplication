import { liveAvailable } from "@/lib/live/gemini";
import { maxMinutesFor } from "@/lib/live/interview";
import { latestInterviewsByLesson, loadLessonContent } from "@/lib/live/store";
import { Card } from "@/components/ui";
import { OralCheck } from "./interview/interview";

const SCOPE_LABEL = { previous: "the previous lesson", module: "the lessons in this module", course: "everything in this course" } as const;

/** An INTERVIEW lesson (spec FR-14.2 v1.4): the admin-configured oral check, in the course flow. */
export async function InterviewLesson({ lessonId, userId, timeMultiplier, backHref }: { lessonId: string; userId: string; timeMultiplier: number; backHref: string }) {
  const loaded = await loadLessonContent(lessonId);
  if (!loaded?.config) return null;
  const cfg = loaded.config;
  if (!loaded.content) {
    return (
      <Card className="mb-6 max-w-3xl p-6">
        <p className="text-sm text-muted">This oral check has no lesson content in scope yet — an admin needs to add a video or text lesson before it.</p>
      </Card>
    );
  }
  const latest = (await latestInterviewsByLesson(userId, [lessonId])).get(lessonId) ?? null;
  return (
    <div className="mb-6 max-w-3xl">
      <p className="mb-4 text-sm text-muted">
        A spoken check on {SCOPE_LABEL[cfg.scope]}: up to {cfg.questionCount} questions, pass mark {cfg.passPct}%.
        {cfg.requirePass ? " Passing completes this lesson." : " Finishing the check completes this lesson."}
      </p>
      <OralCheck
        lessonId={lessonId}
        configured={liveAvailable()}
        questionCount={cfg.questionCount}
        maxMinutes={maxMinutesFor(timeMultiplier, cfg.maxMinutes)}
        passPct={cfg.passPct}
        gating={cfg.requirePass}
        backHref={backHref}
        previous={
          latest && latest.state === "COMPLETED"
            ? {
                scorePct: latest.scorePct,
                outcome: latest.outcome,
                evaluation: latest.evaluation,
                evaluationSource: latest.evaluationSource,
                completedAt: latest.completedAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </div>
  );
}
