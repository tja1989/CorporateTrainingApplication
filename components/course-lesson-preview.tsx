import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { Markdown } from "@/lib/markdown";
import { parseCoverUrl } from "@/lib/workspace-inputs";
import { parseInterviewConfig } from "@/lib/live/interview";
import { ButtonAnchor } from "./ui";
export async function CourseLessonPreview({
  lesson,
}: {
  lesson: typeof t.lessons.$inferSelect;
}) {
  if (lesson.type === "TEXT")
    return (
      <div className="max-w-[72ch]">
        <Markdown text={lesson.payload.body ?? ""} headingOffset={3} />
      </div>
    );
  if (lesson.type === "PDF") {
    const file = parseCoverUrl(lesson.payload.fileUrl ?? "");
    return file.value ? (
      <ButtonAnchor
        href={file.value}
        variant="secondary"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open PDF for review
      </ButtonAnchor>
    ) : (
      <p>PDF unavailable.</p>
    );
  }
  if (lesson.type === "INTERVIEW") {
    const cfg = parseInterviewConfig(lesson.payload.interview);
    return (
      <p className="text-sm">
        {cfg.questionCount} questions · {cfg.passPct}% to pass ·{" "}
        {cfg.maxMinutes} minutes · {cfg.scope} content
        {cfg.focus ? ` · Focus: ${cfg.focus}` : ""}
      </p>
    );
  }
  if (lesson.type === "VIDEO") {
    const [video] = lesson.payload.videoId
      ? await db
          .select()
          .from(t.videos)
          .where(eq(t.videos.id, lesson.payload.videoId))
          .limit(1)
      : [];
    if (!video) return <p>Video unavailable.</p>;
    const chunks = await db
      .select({ start: t.videoChunks.startSec, text: t.videoChunks.text })
      .from(t.videoChunks)
      .where(eq(t.videoChunks.videoId, video.id))
      .orderBy(t.videoChunks.startSec);
    return (
      <div>
        <ButtonAnchor
          href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeId)}`}
          variant="secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
          Watch video for review
        </ButtonAnchor>
        <div className="mt-4 max-w-[72ch] space-y-3">
          {chunks.map((chunk, index) => (
            <p key={index} className="text-sm">
              <span className="text-muted">
                {Math.floor(chunk.start / 60)}:
                {String(Math.floor(chunk.start % 60)).padStart(2, "0")}
              </span>{" "}
              {chunk.text}
            </p>
          ))}
        </div>
      </div>
    );
  }
  const [quiz] = lesson.payload.quizId
    ? await db
        .select()
        .from(t.quizzes)
        .where(eq(t.quizzes.id, lesson.payload.quizId))
        .limit(1)
    : [];
  if (!quiz) return <p>Assessment unavailable.</p>;
  const bankIds = quiz.sections.flatMap((s) => (s.bankId ? [s.bankId] : [])),
    fixedIds = quiz.sections.flatMap((s) => s.fixed ?? []);
  const questions = await db
    .select({
      id: t.questions.id,
      body: t.questions.body,
      bankId: t.questions.bankId,
    })
    .from(t.questions)
    .where(
      and(
        eq(t.questions.status, "APPROVED"),
        sqlQuestionScope(bankIds, fixedIds),
      ),
    );
  return (
    <div>
      <p className="mb-3 text-sm">
        Pass mark {quiz.settings.passPct}% ·{" "}
        {quiz.settings.feedbackMode.toLowerCase()} ·{" "}
        {quiz.sections.reduce(
          (count, s) => count + (s.pickN ?? s.fixed?.length ?? 0),
          0,
        )}{" "}
        questions served
      </p>
      <ol className="list-decimal space-y-3 ps-6">
        {questions.map((q) => (
          <li key={q.id}>
            <p className="font-medium">{q.body.prompt}</p>
            {q.body.options ? (
              <ul className="mt-1 list-disc ps-5 text-sm">
                {q.body.options.map((option, index) => (
                  <li key={index}>{option}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
function sqlQuestionScope(bankIds: string[], fixedIds: string[]) {
  return or(
    bankIds.length ? inArray(t.questions.bankId, bankIds) : sql`false`,
    fixedIds.length ? inArray(t.questions.id, fixedIds) : sql`false`,
  );
}
