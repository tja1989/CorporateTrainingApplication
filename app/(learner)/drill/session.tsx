"use client";

import { IconDisc } from "@/components/icons";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DUR, EASE_OUT } from "@/lib/motion";
import { AnimatedNumber, Button, Card, Chip, PillButton, Skeleton, cx } from "@/components/ui";

import { QuestionFields, type Served } from "@/components/question-input";
import { isAnswered } from "@/lib/quiz/client-state";
import type { Answer } from "@/lib/quiz/scoring";
type Q = Served;
type Feedback = { correct: boolean; explanation: string | null; correctAnswer: string | null };

export function DrillSession({ daysThisWeek, streakWeeks }: { daysThisWeek: number; streakWeeks: number }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [index, setIndex] = useState(0);
  const [confidence, setConfidence] = useState<"sure" | "unsure" | null>(null);
  const [response, setResponse] = useState<Answer | undefined>();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    fetch("/api/drill")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setQuestions(d.questions ?? []))
      .catch(() => { setError("Practice could not load. Refresh the page to try again."); setQuestions([]); });
  }, []);

  if (questions === null) {
    return (
      <div className="mx-auto max-w-md">
        <Skeleton delayed className="mb-3 h-[160px] w-full" />
        <Skeleton delayed className="h-12 w-full" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <Card className="animate-enter mx-auto max-w-md p-6 text-center">
        <IconDisc name="check" tone="success" size={56} className="animate-pop mb-3" />
        <h2 className="display mb-1 text-lg">{error ? "Practice unavailable" : "Nothing due right now"}</h2>
        <p className="text-sm text-muted">{error ?? "You are ahead of the scheduler. Come back tomorrow for more practice."}</p>
      </Card>
    );
  }

  if (finished) {
    return (
      <Card className="animate-enter mx-auto max-w-md p-6 text-center">
        <IconDisc name="flame" tone="accent" size={56} className="animate-pop mb-3" />
        <h2 className="display mb-1 text-2xl">
          <AnimatedNumber value={score} />/{questions.length} — nice work
        </h2>
        <p className="mb-3 text-sm text-muted">+5 points · {Math.min(daysThisWeek + 1, 7)} active day(s) this week{streakWeeks > 0 ? ` · ${streakWeeks}-week streak` : ""}</p>
        <p className="text-xs text-muted">Missed questions come back sooner — that&#39;s the point.</p>
      </Card>
    );
  }

  const q = questions[index];

  async function answer(a: Answer) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
    const res = await fetch("/api/drill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.questionId, answer: a, confidence }),
    });
    if (!res.ok) throw new Error();
    const data = (await res.json()) as Feedback;
    setFeedback(data);
    if (data.correct) setScore((s) => s + 1);
    } catch { setError("Your answer could not be checked. Try again."); } finally { setBusy(false); }
  }

  async function next() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (index + 1 >= questions!.length) {
        const res = await fetch("/api/drill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: true }) });
        if (!res.ok) throw new Error();
        setFinished(true);
      } else { setIndex(i => i + 1); setFeedback(null); setConfidence(null); setResponse(undefined); }
    } catch { setError("Practice completion could not be saved. Try Finish again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md">
      {error ? <p role="alert" className="mb-4 text-sm text-destructive-text">{error}</p> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <Chip variant="neutral">{daysThisWeek}/3 days this week</Chip>
      </div>
      {/* One card at a time; cards swap with a vertical fade (transform + opacity only) */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
        >
          <Card className="p-6">
            {feedback ? <h2 className="mb-4 text-lg font-medium">{q.prompt}</h2> : null}

            {feedback === null ? (
              <>
                <fieldset disabled={busy} className="mb-4 min-w-0">
                  <QuestionFields q={q} answer={response} onChange={setResponse} />
                </fieldset>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>How sure are you?</span>
                  {(["sure", "unsure"] as const).map((c) => (
                    <PillButton
                      key={c}
                      onClick={() => setConfidence(confidence === c ? null : c)}
                      disabled={busy}
                      aria-pressed={confidence === c}
                      className={cx(confidence === c && "border-primary bg-success-tint text-success-fg")}
                    >
                      {c === "sure" ? "Sure" : "Not sure"}
                    </PillButton>
                  ))}
                </div>
                <Button className="mt-4 w-full" disabled={busy || !isAnswered(q, response)} onClick={() => response && void answer(response)}>{busy ? "Checking…" : "Check answer"}</Button>
              </>
            ) : (
              <div className="animate-enter">
                <Chip variant={feedback.correct ? "success" : "destructive"}>{feedback.correct ? "Correct" : "Not quite"}</Chip>
                {!feedback.correct && feedback.correctAnswer ? (
                  <p className="mt-2 text-sm">
                    Answer: <strong>{feedback.correctAnswer}</strong>
                  </p>
                ) : null}
                {feedback.explanation ? <p className="mt-2 text-sm text-muted">{feedback.explanation}</p> : null}
                <Button disabled={busy} onClick={next} className="mt-4 w-full">
                  {index + 1 >= questions.length ? "Finish" : "Next"}
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
