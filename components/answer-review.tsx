import { AiSurface, Card, Chip, Icon, cx } from "@/components/ui";
import type { ReviewChoice, ReviewItem } from "@/lib/quiz/review";

/** One answered question after an assessment: the learner's answer, right or wrong, and the key once revealed. */
export function AnswerReview({ item, number }: { item: ReviewItem; number: number }) {
  const pickedCount = item.choices.filter((c) => c.picked).length;
  // A picked choice is known right/wrong from the key, a fully right question, or a single wrong pick.
  const pickedVerdict = (c: ReviewChoice): boolean | null =>
    c.correct ?? (item.correct ? true : item.correct === false && pickedCount === 1 ? false : null);
  return (
    <Card className="mb-3 p-4 text-sm sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="font-medium">
          {number}. {item.prompt}
        </p>
        {item.correct === null ? (
          <Chip variant="ai">AI-graded</Chip>
        ) : item.correct ? (
          <Chip variant="success">Correct</Chip>
        ) : (
          <Chip variant="destructive">Incorrect</Chip>
        )}
      </div>
      {item.choices.length ? (
        <ul className="mb-3 flex flex-col gap-2">
          {item.choices.map((c, i) => {
            const verdict = c.picked ? pickedVerdict(c) : null;
            return (
              <li
                key={i}
                className={cx(
                  "flex items-start gap-2 rounded-control border px-3 py-2",
                  verdict === true
                    ? "border-success bg-success-tint"
                    : verdict === false
                      ? "border-destructive bg-destructive-tint"
                      : c.correct
                        ? "border-success"
                        : "border-border",
                )}
              >
                <Icon
                  name={verdict === false ? "x" : "check"}
                  size={16}
                  className={cx(
                    "mt-0.5 shrink-0",
                    verdict === false ? "text-destructive-text" : "text-success-fg",
                    verdict === null && !c.correct && "invisible",
                  )}
                />
                <span className="flex-1">{c.label}</span>
                {c.picked ? <span className="text-xs font-medium">Your answer</span> : null}
                {c.correct ? <span className="text-xs font-medium text-success-fg">Correct answer</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {item.yourAnswer.length && !item.choices.length ? (
        <AnswerLines label="Your answer" lines={item.yourAnswer} />
      ) : null}
      {item.yourAnswer.length && item.choices.length ? (
        <p className="mb-3 text-muted">You did not choose an answer.</p>
      ) : null}
      {item.correctAnswer.length ? <AnswerLines label="Correct answer" lines={item.correctAnswer} /> : null}
      {item.correct !== null ? (
        <div
          className={cx(
            "flex gap-2 rounded-control p-3",
            item.correct ? "bg-success-tint text-success-fg" : "bg-surface-2",
          )}
        >
          <Icon name={item.correct ? "check" : "x"} size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{item.correct ? "Nice work" : "Not quite"}</p>
            <p className={item.correct ? undefined : "text-muted"}>
              {item.explanation ?? (item.correct ? "You answered this correctly." : "Review the lesson, then try again.")}
            </p>
          </div>
        </div>
      ) : null}
      {item.rationale ? (
        <AiSurface variant="block" className="mt-2" label="AI grading rationale">
          {item.rationale}
        </AiSurface>
      ) : null}
      {item.correct === false && item.sourceStartSec !== null ? (
        <p className="mt-2 text-xs text-muted">
          Review this part of the video:{" "}
          <span className="bidi-isolate font-mono">
            {Math.floor(item.sourceStartSec / 60)}:{String(Math.floor(item.sourceStartSec % 60)).padStart(2, "0")}
          </span>
        </p>
      ) : null}
    </Card>
  );
}

function AnswerLines({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <ul className="flex flex-col gap-1">
        {lines.map((line, i) => (
          <li key={i} className="rounded-control bg-surface-2 px-3 py-2">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
