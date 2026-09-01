"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AiSurface, AnimatedNumber, Button, Card, Chip, Input, Select, Textarea, cx } from "@/components/ui";
import { Dialog } from "@/components/dialog";

type Served = {
  questionId: string;
  type: string;
  points: number;
  prompt: string;
  stimulus: string | null;
  options: string[] | null;
  left: string[] | null;
  right: string[] | null;
  orderItems: string[] | null;
};
type Answer =
  | { kind: "choice"; selected: number[] }
  | { kind: "text"; text: string }
  | { kind: "matching"; pairs: Record<number, number> }
  | { kind: "ordering"; order: number[] };
type Settings = { oneAtATime: boolean; noBacktrack: boolean; feedbackMode: string; integrityMode: boolean; passPct: number; graceSec: number };
type Result = {
  state: string;
  gradingState: string;
  scorePct: number;
  passed: boolean | null;
  reveal: boolean;
  review: Array<{ questionId: string; prompt: string; correct: boolean | null; explanation: string | null; sourceStartSec: number | null; rationale: string | null }>;
};

export function QuizRunner({
  quizId,
  windowOpen,
  attemptsLeft,
  latestFinalized,
  resume,
}: {
  quizId: string;
  windowOpen: boolean;
  attemptsLeft: number | null;
  latestFinalized: { gradingState: string; appealed: boolean } | null;
  resume: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"preflight" | "consent" | "running" | "result">("preflight");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [served, setServed] = useState<Served[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [appealSent, setAppealSent] = useState(false);
  const pendingEvents = useRef<Array<{ kind: string; detail?: Record<string, unknown> }>>([]);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const blurStart = useRef<number | null>(null);

  const begin = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/quiz/${quizId}/start`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not start the assessment.");
      setPhase("preflight");
      return;
    }
    setAttemptId(data.attemptId);
    setServed(data.served);
    setSettings(data.settings);
    setAnswers(data.answers ?? {});
    setDeadline(data.deadlineAt ? new Date(data.deadlineAt) : null);
    setPhase("running");
    if (data.settings.integrityMode) {
      const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => pendingEvents.current.push({ kind: "fullscreen_denied" }));
      } else {
        // iOS Safari has no programmatic fullscreen — informational, monitoring proceeds (spec FR-7.1)
        pendingEvents.current.push({ kind: "fullscreen_unavailable", detail: { platform: navigator.userAgent.slice(0, 60) } });
      }
    }
  }, [quizId]);

  // integrity listeners
  useEffect(() => {
    if (phase !== "running" || !settings?.integrityMode) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        blurStart.current = Date.now();
        pendingEvents.current.push({ kind: "blur" });
      } else if (blurStart.current) {
        const ms = Date.now() - blurStart.current;
        if (ms > 60_000) pendingEvents.current.push({ kind: "focus_lost_long", detail: { ms } });
        blurStart.current = null;
      }
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) pendingEvents.current.push({ kind: "fullscreen_exit" });
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      pendingEvents.current.push({ kind: "paste_blocked" });
    };
    const onCtx = (e: Event) => e.preventDefault();
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onCtx);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, [phase, settings?.integrityMode]);

  // countdown
  useEffect(() => {
    if (!deadline || phase !== "running") return;
    const iv = setInterval(() => {
      const left = Math.floor((deadline.getTime() - Date.now()) / 1000);
      setRemaining(left);
      if (left <= -(settings?.graceSec ?? 30)) submit(); // eslint-disable-line @typescript-eslint/no-use-before-define
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, phase]);

  // autosave every 10s (+ offline buffering, spec FR-6.5)
  useEffect(() => {
    if (phase !== "running" || !attemptId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/attempt/${attemptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: answersRef.current, events: pendingEvents.current.splice(0) }),
        });
        if (res.status === 409) {
          const d = await res.json();
          setError(d.error);
          await submit(); // eslint-disable-line @typescript-eslint/no-use-before-define
          return;
        }
        setOffline(false);
        setSaved(true);
      } catch {
        setOffline(true);
        pendingEvents.current.push({ kind: "connection_lost" }); // informational, never red (spec FR-6.5)
      }
    }, 10_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, attemptId]);

  const submit = useCallback(async () => {
    if (!attemptId) return;
    try {
      await fetch(`/api/attempt/${attemptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersRef.current, events: pendingEvents.current.splice(0) }),
      }).catch(() => {});
      const res = await fetch(`/api/attempt/${attemptId}`, { method: "POST" });
      const data = await res.json();
      setResult(data);
      setPhase("result");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch {
      setOffline(true);
    }
  }, [attemptId]);

  const setAnswer = (qid: string, a: Answer) => {
    setAnswers((prev) => ({ ...prev, [qid]: a }));
    setSaved(false);
  };

  /* ---------------- preflight & consent ---------------- */
  if (phase === "preflight" || phase === "consent") {
    const exhausted = attemptsLeft !== null && attemptsLeft <= 0 && !resume;
    return (
      <div className="flex flex-col items-start gap-3">
        {error ? <p role="alert" className="rounded-control bg-destructive-tint px-3 py-2 text-sm text-destructive-text">{error}</p> : null}
        {windowOpen && !exhausted ? (
          <Button
            disabled={phase === "consent"}
            onClick={() => {
              // consent interstitial only for monitored assessments (spec FR-7.4)
              fetch(`/api/quiz/${quizId}/start`, { method: "HEAD" }).catch(() => {});
              setPhase("consent");
            }}
          >
            {resume ? "Resume attempt" : "Start"}
          </Button>
        ) : null}
        {latestFinalized && latestFinalized.gradingState === "FINAL" && !latestFinalized.appealed && !appealSent ? (
          <button
            className="text-sm text-primary underline underline-offset-2"
            onClick={async () => {
              const res = await fetch(`/api/attempt/appeal-latest?quizId=${quizId}`, { method: "POST" });
              if (res.ok) setAppealSent(true);
            }}
          >
            Request human re-review of the AI-graded answers
          </button>
        ) : null}
        {appealSent ? <Chip variant="success">Appeal sent — a reviewer will confirm your grade.</Chip> : null}
        {phase === "consent" ? <ConsentGate quizId={quizId} onProceed={begin} onCancel={() => setPhase("preflight")} /> : null}
      </div>
    );
  }

  /* ---------------- results ---------------- */
  if (phase === "result" && result) {
    return (
      <div className="animate-enter">
        <Card className="mb-4 p-6">
          <p className="mb-1 text-xl font-medium">
            <AnimatedNumber value={result.scorePct} suffix="%" />
          </p>
          {result.gradingState === "PROVISIONAL" ? (
            <div>
              <Chip variant="warning">Pending confirmation</Chip>
              <p className="mt-2 text-sm text-muted">
                A human reviewer confirms AI-graded answers before this result is final. Your compliance status is not
                affected until then. You&#39;ll get a notification.
              </p>
            </div>
          ) : result.passed ? (
            <Chip variant="success">Passed</Chip>
          ) : (
            <Chip variant="destructive">Not passed</Chip>
          )}
          {!result.reveal ? (
            <p className="mt-2 text-sm text-muted">Correct answers are revealed after the assessment window closes.</p>
          ) : null}
        </Card>
        {result.reveal
          ? result.review.map((r, i) => (
              <Card key={r.questionId} className="mb-2 p-4 text-sm">
                <p className="mb-1 font-medium">
                  {i + 1}. {r.prompt}{" "}
                  {r.correct === null ? <Chip variant="ai">AI-graded</Chip> : r.correct ? <Chip variant="success">✓</Chip> : <Chip variant="destructive">✗</Chip>}
                </p>
                {r.explanation ? <p className="text-muted">{r.explanation}</p> : null}
                {r.rationale ? (
                  <AiSurface variant="block" className="mt-2" label="AI grading rationale">
                    {r.rationale}
                  </AiSurface>
                ) : null}
                {r.correct === false && r.sourceStartSec !== null ? (
                  <p className="mt-1 text-xs text-muted">Review this part of the video: <span className="bidi-isolate font-mono">{Math.floor(r.sourceStartSec / 60)}:{String(Math.floor(r.sourceStartSec % 60)).padStart(2, "0")}</span></p>
                ) : null}
              </Card>
            ))
          : null}
        <Button variant="secondary" onClick={() => router.refresh()}>Done</Button>
      </div>
    );
  }

  /* ---------------- running ---------------- */
  if (!settings) return null;
  const visible = settings.oneAtATime ? [served[index]] : served;
  const answeredCount = served.filter((s) => answers[s.questionId]).length;

  return (
    <div>
      <div className="sticky top-12 z-20 mb-4 flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2 text-sm">
        <span className="text-muted">{answeredCount}/{served.length} answered</span>
        {settings.oneAtATime ? (
          <span className="flex gap-1" aria-label={`Question ${index + 1} of ${served.length}`}>
            {served.map((_, i) => (
              <span key={i} className={cx("size-2 rounded-full transition-colors", i === index ? "bg-primary" : answers[served[i].questionId] ? "bg-success" : "bg-border")} />
            ))}
          </span>
        ) : null}
        <span className="flex-1" />
        {offline ? <Chip variant="warning">Reconnecting — answers saved locally</Chip> : <span className={cx("text-xs text-muted transition-opacity", saved ? "opacity-100" : "opacity-60")}>{saved ? "Saved ✓" : "Saving…"}</span>}
        {remaining !== null ? (
          <Chip variant={remaining < 60 ? "destructive" : "neutral"}>
            {remaining <= 0 ? "Time up" : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
          </Chip>
        ) : null}
      </div>

      {visible.map((q) => (
        <QuestionInput key={q.questionId} q={q} answer={answers[q.questionId]} onChange={(a) => setAnswer(q.questionId, a)} />
      ))}

      <div className="mt-4 flex items-center gap-2">
        {settings.oneAtATime && index > 0 && !settings.noBacktrack ? (
          <Button variant="secondary" onClick={() => setIndex((i) => i - 1)}>Back</Button>
        ) : null}
        {settings.oneAtATime && index < served.length - 1 ? (
          <Button onClick={() => setIndex((i) => i + 1)}>Next</Button>
        ) : (
          <Button onClick={submit}>Submit</Button>
        )}
      </div>
    </div>
  );
}

/** Consent interstitial for monitored assessments (spec FR-7.4) — an L2 dialog, never a bare card. */
function ConsentGate({ quizId, onProceed, onCancel }: { quizId: string; onProceed: () => void; onCancel: () => void }) {
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`/api/quiz/${quizId}/consent-info`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.integrityMode) onProceed();
        else setNeedsConsent(true);
      })
      .catch(() => onProceed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);
  if (needsConsent === null) return <p className="text-sm text-muted">Preparing…</p>;
  const fsSupported = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
  return (
    <Dialog open onClose={onCancel} title="Before you start — what this assessment records">
      <ul className="mb-3 flex list-disc flex-col gap-1 ps-6 text-sm">
        <li>When you leave this screen or switch apps (timestamps only)</li>
        {fsSupported ? <li>Fullscreen is required; leaving it pauses the attempt</li> : <li>Fullscreen isn’t available on this device — only screen-leave events are recorded</li>}
        <li>Copy and paste are disabled during the assessment</li>
        <li><strong>No camera. No microphone. No screen recording.</strong></li>
      </ul>
      <p className="mb-6 text-sm text-muted">
        Why: this keeps certifications fair. A person — never software — reviews any flags before they affect you. Events
        are deleted 6 months after the result is final. If you prefer, ask your manager for a supervised in-person sitting instead.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          autoFocus
          onClick={async () => {
            await fetch(`/api/quiz/${quizId}/consent-info`, { method: "POST" }).catch(() => {});
            onProceed();
          }}
        >
          I understand — start
        </Button>
      </div>
    </Dialog>
  );
}

const optionRow = "touch-target rounded-input border px-3 py-2 text-start text-sm";

function QuestionInput({ q, answer, onChange }: { q: Served; answer: Answer | undefined; onChange: (a: Answer) => void }) {
  return (
    <Card className="mb-3 p-4">
      {q.stimulus ? <p className="mb-2 rounded-control bg-surface-2 p-3 text-sm">{q.stimulus}</p> : null}
      <p className="mb-3 font-medium">{q.prompt}</p>

      {(q.type === "mcq_single" || q.type === "truefalse") && q.options ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={q.prompt}>
          {q.options.map((opt, i) => {
            const selected = answer?.kind === "choice" && answer.selected[0] === i;
            return (
              <button
                key={i}
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ kind: "choice", selected: [i] })}
                className={cx(optionRow, "pressable", selected ? "border-primary bg-success-tint" : "border-border hover:bg-surface-2")}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : null}

      {q.type === "mcq_multi" && q.options ? (
        <div className="flex flex-col gap-2">
          {q.options.map((opt, i) => {
            const selected = answer?.kind === "choice" && answer.selected.includes(i);
            return (
              <label
                key={i}
                className={cx(optionRow, "flex cursor-pointer items-center gap-2", selected ? "border-primary bg-success-tint" : "border-border hover:bg-surface-2")}
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={!!selected}
                  onChange={(e) => {
                    const prev = answer?.kind === "choice" ? answer.selected : [];
                    onChange({ kind: "choice", selected: e.target.checked ? [...prev, i] : prev.filter((x) => x !== i) });
                  }}
                />
                {opt}
              </label>
            );
          })}
        </div>
      ) : null}

      {q.type === "fill_blank" ? (
        <Input
          value={answer?.kind === "text" ? answer.text : ""}
          onChange={(e) => onChange({ kind: "text", text: e.target.value })}
          aria-label="Your answer"
          placeholder="Type your answer"
        />
      ) : null}

      {q.type === "free_text" ? (
        <Textarea
          value={answer?.kind === "text" ? answer.text : ""}
          onChange={(e) => onChange({ kind: "text", text: e.target.value })}
          rows={5}
          aria-label="Your answer"
          placeholder="Write your answer in any language…"
        />
      ) : null}

      {q.type === "matching" && q.left && q.right ? (
        <div className="flex flex-col gap-2">
          {q.left.map((left, li) => (
            <div key={li} className="flex items-center gap-2 text-sm">
              <span className="w-2/5">{left}</span>
              <Select
                value={answer?.kind === "matching" ? (answer.pairs[li] ?? "") : ""}
                onChange={(e) => {
                  const prev = answer?.kind === "matching" ? { ...answer.pairs } : {};
                  prev[li] = Number(e.target.value);
                  onChange({ kind: "matching", pairs: prev });
                }}
                className="flex-1"
                aria-label={`Match for ${left}`}
              >
                <option value="" disabled>Choose…</option>
                {q.right!.map((right, ri) => (
                  <option key={ri} value={ri}>{right}</option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      ) : null}

      {q.type === "ordering" && q.orderItems ? (
        <OrderingInput items={q.orderItems} answer={answer} onChange={onChange} />
      ) : null}
    </Card>
  );
}

/** Tap-based reordering (up/down buttons) — no drag required (SC 2.5.7). */
function OrderingInput({ items, answer, onChange }: { items: string[]; answer: Answer | undefined; onChange: (a: Answer) => void }) {
  const order = answer?.kind === "ordering" ? answer.order : items.map((_, i) => i);
  const move = (pos: number, dir: -1 | 1) => {
    const next = [...order];
    const target = pos + dir;
    if (target < 0 || target >= next.length) return;
    [next[pos], next[target]] = [next[target], next[pos]];
    onChange({ kind: "ordering", order: next });
  };
  return (
    <ol className="flex flex-col gap-2">
      {order.map((displayIdx, pos) => (
        <li key={displayIdx} className="flex items-center gap-2 rounded-input border border-border px-3 py-2 text-sm">
          <span className="w-6 text-xs text-muted">{pos + 1}.</span>
          <span className="flex-1">{items[displayIdx]}</span>
          <button onClick={() => move(pos, -1)} aria-label="Move up" className="touch-target pressable rounded-control px-2 hover:bg-surface-2 disabled:opacity-50" disabled={pos === 0}>↑</button>
          <button onClick={() => move(pos, 1)} aria-label="Move down" className="touch-target pressable rounded-control px-2 hover:bg-surface-2 disabled:opacity-50" disabled={pos === order.length - 1}>↓</button>
        </li>
      ))}
    </ol>
  );
}
