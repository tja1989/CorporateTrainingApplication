import { and, asc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { Markdown } from "@/lib/markdown";
import { parseCoverUrl } from "@/lib/workspace-inputs";
import { parseInterviewConfig } from "@/lib/live/interview";
import { ButtonAnchor } from "./ui";
import { plural } from "@/lib/format";
import { banksWithApprovedCounts, fromSections } from "@/lib/quiz/composition";
import { QuestionGuide } from "@/app/(workspace)/admin/reviews/question-guide";

/** How many of a drawn bank's approved questions the answer key lists. */
const DRAWN_QUESTIONS_SHOWN = 50;

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
        {plural(cfg.questionCount, "question")}, {cfg.passPct}% to pass,{" "}
        {plural(cfg.maxMinutes, "minute")}, covers {cfg.scope === "course" ? "the whole course" : cfg.scope === "previous" ? "the previous lesson" : "this module"}
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
  // The answer key for reviewers: every picked question in full, then each
  // random draw with the approved questions it can serve.
  const { picked, draws } = fromSections(quiz.sections);
  const approved = picked.length
    ? await db
        .select()
        .from(t.questions)
        .where(and(inArray(t.questions.id, picked), eq(t.questions.status, "APPROVED")))
    : [];
  const byId = new Map(approved.map((q) => [q.id, q]));
  const questions = picked.flatMap((id) => byId.get(id) ?? []);
  const drawnBankIds = [...new Set(draws.map((d) => d.bankId))];
  const banks = new Map(
    (await banksWithApprovedCounts(drawnBankIds)).map((b) => [b.id, b]),
  );
  const bankQuestions = new Map(
    await Promise.all(
      drawnBankIds.map(
        async (bankId) =>
          [
            bankId,
            await db
              .select()
              .from(t.questions)
              .where(and(eq(t.questions.bankId, bankId), eq(t.questions.status, "APPROVED")))
              .orderBy(asc(t.questions.createdAt), asc(t.questions.id))
              .limit(DRAWN_QUESTIONS_SHOWN),
          ] as const,
      ),
    ),
  );
  return (
    <div className="min-w-0">
      <p className="mb-3 text-sm">
        Pass mark {quiz.settings.passPct}%,{" "}
        {plural(quiz.sections.reduce(
          (count, s) => count + (s.pickN ?? s.fixed?.length ?? 0),
          0,
        ), "question")} per attempt
      </p>
      {questions.length ? (
        <ol aria-label="Picked questions" className="list-decimal space-y-4 ps-6">
          {questions.map((q) => (
            <li key={q.id} className="min-w-0">
              <p className="break-words font-medium">{q.body.prompt}</p>
              <QuestionGuide type={q.type} body={q.body} rubric={q.rubric} />
            </li>
          ))}
        </ol>
      ) : null}
      {draws.length ? (
        <ul aria-label="Random draws" className="mt-3 list-disc space-y-1 ps-6 text-sm">
          {draws.map((d, index) => {
            const bank = banks.get(d.bankId);
            const shown = bankQuestions.get(d.bankId) ?? [];
            const more = (bank?.approvedCount ?? 0) - shown.length;
            return (
              <li key={index} className="break-words">
                {`${d.pickN} random from ${bank?.name ?? "an unknown bank"} (${bank?.approvedCount ?? 0} approved questions)`}
                {shown.length ? (
                  <details className="mt-1">
                    <summary className="touch-target flex items-center text-link">
                      Show the approved questions in this bank
                    </summary>
                    <ol aria-label={`Approved questions in ${bank?.name ?? "this bank"}`} className="list-decimal space-y-4 ps-6 text-base">
                      {shown.map((q) => (
                        <li key={q.id} className="min-w-0">
                          <p className="break-words font-medium">{q.body.prompt}</p>
                          <QuestionGuide type={q.type} body={q.body} rubric={q.rubric} />
                        </li>
                      ))}
                    </ol>
                    {more > 0 ? (
                      <p className="mb-3 text-muted">{`and ${more} more approved questions in this bank`}</p>
                    ) : null}
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
