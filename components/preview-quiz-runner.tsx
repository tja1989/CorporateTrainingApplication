"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink, Card, Chip } from "@/components/ui";
import { QuestionInput } from "@/components/question-input";
import { QuestionGuide } from "@/app/(workspace)/admin/reviews/question-guide";
import { startPreviewQuizAction, submitPreviewQuizAction, type PreviewResult, type PreviewStart } from "@/lib/preview/quiz-actions";
import type { Answer } from "@/lib/quiz/scoring";

type Rules = { attemptsLimit: number | null; integrityMode: boolean; exam: boolean };

const WRITTEN_NOTE = "Written answers are graded by AI and reviewed by people for learners. Not scored in preview.";

export function PreviewQuizRunner({ courseId, lessonId, lessonHref, rules }: { courseId: string; lessonId: string; lessonHref: string; rules: Rules }) {
  const [start, setStart] = useState<PreviewStart | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submitting = useRef(false);

  async function begin() {
    setBusy(true);
    setError(null);
    const res = await startPreviewQuizAction(courseId, lessonId);
    setBusy(false);
    if (res.error || !res.start) {
      setError(res.error ?? "Could not start the preview.");
      return;
    }
    submitting.current = false;
    setResult(null);
    setAnswers({});
    answersRef.current = {};
    setIndex(0);
    setTimedOut(false);
    setRemaining(res.start.settings.timeLimitSec ?? null);
    setStart(res.start);
  }

  async function submit() {
    if (!start || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const res = await submitPreviewQuizAction(courseId, lessonId, start.servedItems, answersRef.current);
    setBusy(false);
    if (res.error || !res.result) {
      submitting.current = false;
      setError(res.error ?? "Could not score the preview.");
      return;
    }
    setResult(res.result);
  }

  const submitRef = useRef(submit);
  submitRef.current = submit;
  const running = !!start && !result;
  const limited = start?.settings.timeLimitSec != null;
  useEffect(() => {
    if (!running || !limited) return;
    const end = Date.now() + (start!.settings.timeLimitSec as number) * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
        setTimedOut(true);
        void submitRef.current();
      }
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, limited, start]);

  const alert = error ? <p role="alert" className="mb-4 rounded-control bg-destructive-tint px-3 py-2 text-sm text-destructive-text">{error}</p> : null;

  if (result) {
    return (
      <div>
        <Card className="mb-4 p-6">
          <p className="display mb-2 text-xl">Score {result.earned} of {result.possible} ({result.pct}%)</p>
          <div className="flex flex-wrap items-center gap-2">
            {result.passed ? <Chip variant="success">Passed</Chip> : <Chip variant="destructive">Not passed</Chip>}
            <span className="text-sm text-muted">Pass mark {result.passPct}%</span>
          </div>
          {result.writtenCount > 0 ? <p className="mt-3 text-sm text-muted">{WRITTEN_NOTE}</p> : null}
        </Card>
        {result.items.map((item, i) => (
          <Card key={item.questionId} className="mb-3 p-4 text-sm">
            <p className="mb-1 font-medium [overflow-wrap:anywhere]">{i + 1}. {item.prompt}</p>
            <p className="text-muted">{item.earned === null ? WRITTEN_NOTE : `${item.earned} / ${item.points} points`}</p>
            <QuestionGuide type={item.type} body={item.body} rubric={item.rubric} />
          </Card>
        ))}
        {alert}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void begin()}>{busy ? "Preparing…" : "Try again"}</Button>
          <ButtonLink variant="secondary" href={lessonHref}>Return to lesson</ButtonLink>
        </div>
      </div>
    );
  }

  if (!start) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ul className="flex flex-col gap-1 text-sm text-muted">
          <li>Learners get {rules.attemptsLimit ?? "unlimited"} attempts</li>
          {rules.integrityMode ? <li>Integrity monitoring is on for learners; it doesn&#39;t run in preview.</li> : null}
          {rules.exam ? <li>In exam mode, learners see answers only after the window closes.</li> : null}
        </ul>
        {alert}
        {error === "This quiz has no questions yet." ? null : <Button disabled={busy} onClick={() => void begin()}>{busy ? "Preparing…" : "Start"}</Button>}
      </div>
    );
  }

  const { served, settings } = start;
  const visible = settings.oneAtATime ? [served[index]] : served;
  const last = !settings.oneAtATime || index === served.length - 1;
  return (
    <div>
      {remaining !== null ? (
        <div className="mb-4 flex items-center gap-3 text-sm">
          <Chip variant={remaining < 60 ? "destructive" : "neutral"}>
            <span role="timer" aria-label="Time remaining">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>
          </Chip>
        </div>
      ) : null}
      {timedOut ? <p role="status" className="mb-4 rounded-control bg-warning-tint px-3 py-2 text-sm text-warning-fg">Time&#39;s up. Learners&#39; answers are submitted automatically at this point.</p> : null}
      {alert}
      {settings.oneAtATime ? <p className="mb-3 text-sm text-muted">Question {index + 1} of {served.length}</p> : null}
      <fieldset disabled={busy || timedOut} aria-label="Preview answers" className="min-w-0">
        {visible.map((q) => (
          <QuestionInput key={q.questionId} q={q} answer={answers[q.questionId]} onChange={(a) => setAnswers((prev) => ({ ...prev, [q.questionId]: a }))} />
        ))}
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {settings.oneAtATime && !settings.noBacktrack && index > 0 ? <Button variant="secondary" disabled={busy} onClick={() => setIndex((i) => i - 1)}>Previous</Button> : null}
        {last ? (
          <Button disabled={busy} onClick={() => void submit()}>{busy ? "Scoring…" : "Submit"}</Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)}>Next</Button>
        )}
      </div>
    </div>
  );
}
