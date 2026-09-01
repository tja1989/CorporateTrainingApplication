"use client";

import { useEffect, useState } from "react";
import { Button, Card, Chip, Skeleton, cx } from "@/components/ui";

type Q = { questionId: string; type: string; prompt: string; options: string[] | null };
type Feedback = { correct: boolean; explanation: string | null; correctAnswer: string | null };

export function DrillSession({ daysThisWeek, streakWeeks }: { daysThisWeek: number; streakWeeks: number }) {
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [index, setIndex] = useState(0);
  const [confidence, setConfidence] = useState<"sure" | "unsure" | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    fetch("/api/drill")
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .catch(() => setQuestions([]));
  }, []);

  if (questions === null) {
    return (
      <div className="mx-auto max-w-md">
        <Skeleton className="mb-3 h-40 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <Card className="animate-enter mx-auto max-w-md p-6 text-center">
        <p className="mb-1 text-2xl" aria-hidden>✓</p>
        <h1 className="mb-1 font-medium">Nothing due right now</h1>
        <p className="text-sm text-muted">You&#39;re ahead of the scheduler. Come back tomorrow — spaced practice works best with gaps.</p>
      </Card>
    );
  }

  if (finished) {
    return (
      <Card className="animate-enter mx-auto max-w-md p-6 text-center">
        <p className="mb-2 text-3xl" aria-hidden>◎</p>
        <h1 className="mb-1 text-xl font-semibold">
          {score}/{questions.length} — nice work
        </h1>
        <p className="mb-3 text-sm text-muted">+5 points · {Math.min(daysThisWeek + 1, 7)} active day(s) this week{streakWeeks > 0 ? ` · ${streakWeeks}-week streak` : ""}</p>
        <p className="text-xs text-muted">Missed questions come back sooner — that&#39;s the point.</p>
      </Card>
    );
  }

  const q = questions[index];

  async function answer(a: { kind: "choice"; selected: number[] } | { kind: "text"; text: string }) {
    const res = await fetch("/api/drill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.questionId, answer: a, confidence }),
    });
    const data = (await res.json()) as Feedback;
    setFeedback(data);
    if (data.correct) setScore((s) => s + 1);
  }

  async function next() {
    setFeedback(null);
    setConfidence(null);
    setTextAnswer("");
    if (index + 1 >= questions!.length) {
      await fetch("/api/drill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: true }) });
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>Question {index + 1} of {questions.length}</span>
        <Chip variant="neutral">{daysThisWeek}/3 days this week</Chip>
      </div>
      <Card className="animate-enter p-5">
        <p className="mb-4 font-medium">{q.prompt}</p>

        {feedback === null ? (
          <>
            {q.options ? (
              <div className="mb-4 flex flex-col gap-1.5">
                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => answer({ kind: "choice", selected: [i] })}
                    className="touch-target pressable rounded-[--radius-control] border border-border px-3 py-2.5 text-start text-sm hover:bg-surface-2"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <form
                className="mb-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (textAnswer.trim()) answer({ kind: "text", text: textAnswer });
                }}
              >
                <input
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  className="min-w-0 flex-1 rounded-[--radius-control] border border-border bg-surface px-3 py-2.5 text-sm"
                  placeholder="Type your answer"
                  aria-label="Your answer"
                />
                <Button type="submit" disabled={!textAnswer.trim()}>Go</Button>
              </form>
            )}
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>How sure are you?</span>
              {(["sure", "unsure"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setConfidence(confidence === c ? null : c)}
                  className={cx("rounded-full border px-2.5 py-1 capitalize", confidence === c ? "border-primary bg-success-tint text-success-fg" : "border-border")}
                >
                  {c === "sure" ? "Sure" : "Not sure"}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="animate-enter">
            <Chip variant={feedback.correct ? "success" : "destructive"}>{feedback.correct ? "Correct ✓" : "Not quite"}</Chip>
            {!feedback.correct && feedback.correctAnswer ? (
              <p className="mt-2 text-sm">Answer: <strong>{feedback.correctAnswer}</strong></p>
            ) : null}
            {feedback.explanation ? <p className="mt-2 text-sm text-muted">{feedback.explanation}</p> : null}
            <Button onClick={next} className="mt-4 w-full">
              {index + 1 >= questions.length ? "Finish" : "Next"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
