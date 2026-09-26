"use client";

import { Icon } from "@/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AiSurface, AnimatedNumber, Button, ButtonLink, Card, Chip, cx } from "@/components/ui";
import { AttemptSaveError, isAnswered, resultStatus, saveAttemptAnswers, submitSavedAttempt } from "@/lib/quiz/client-state";
import { QuestionInput, type Served } from "@/components/question-input";
import type { Answer } from "@/lib/quiz/scoring";
import { Dialog } from "@/components/dialog";

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
  lessonHref,
}: {
  quizId: string;
  windowOpen: boolean;
  attemptsLeft: number | null;
  latestFinalized: { gradingState: string; appealed: boolean } | null;
  resume: boolean;
  lessonHref?: string;
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
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const submitting = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const autosavePending = useRef(false);

  // Autosave and final save/submit share one queue. Rejection is returned to the
  // caller without poisoning the queue, so a retained answer can be retried.
  const serialize = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = saveQueue.current.then(operation);
    saveQueue.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);
  const [appealSent, setAppealSent] = useState(false);
  const pendingEvents = useRef<Array<{ kind: string; detail?: Record<string, unknown> }>>([]);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const blurStart = useRef<number | null>(null);

  const begin = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
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
    } catch {
      setError("Could not connect. Try starting again.");
      setPhase("preflight");
    } finally {
      setBusy(false);
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

  const submit = useCallback(async () => {
    if (!attemptId || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const snapshot = answersRef.current;
    try {
      const data = await serialize(async () => {
        // Prior saves have now settled and removed their acknowledged events.
        const events = [...pendingEvents.current];
        const result = await submitSavedAttempt(attemptId, snapshot, events);
        pendingEvents.current.splice(0, events.length);
        return result;
      });
      setSaved(true);
      setOffline(false);
      setResult(data);
      setPhase("result");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (error) {
      setSaved(false);
      setOffline(true);
      setError(error instanceof Error ? error.message : "Submission failed. Keep this page open and retry.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }, [attemptId, serialize]);

  // Answers remain in this open tab until acknowledged by the server. Do not
  // claim durable local storage or mark a newer edit saved by an older request.
  useEffect(() => {
    if (phase !== "running" || !attemptId) return;
    const save = async () => {
      if (autosavePending.current || submitting.current) return;
      autosavePending.current = true;
      try {
        await serialize(async () => {
          const snapshot = answersRef.current;
          const events = [...pendingEvents.current];
          await saveAttemptAnswers(attemptId, snapshot, events);
          pendingEvents.current.splice(0, events.length);
          if (!submitting.current) {
            setOffline(false);
            setSaved(answersRef.current === snapshot);
            setError(null);
          }
        });
      } catch (error) {
        if (error instanceof AttemptSaveError && error.submitted) {
          await submit();
        } else if (!submitting.current) {
          setSaved(false);
          setOffline(true);
          setError("Answers are not saved yet. Keep this tab open; we will retry when connected.");
        }
      } finally {
        autosavePending.current = false;
      }
    };
    const iv = setInterval(save, 10_000);
    window.addEventListener("online", save);
    return () => {
      clearInterval(iv);
      window.removeEventListener("online", save);
    };
  }, [phase, attemptId, serialize, submit]);

  const setAnswer = (qid: string, answer: Answer) => {
    if (submitting.current) return;
    const next = { ...answersRef.current, [qid]: answer };
    answersRef.current = next;
    setAnswers(next);
    setSaved(false);
  };

  /* ---------------- preflight & consent ---------------- */
  if (phase === "preflight" || phase === "consent") {
    const exhausted = attemptsLeft !== null && attemptsLeft <= 0 && !resume;
    return (
      <div className="flex flex-col items-start gap-3">
        {exhausted ? <p className="text-sm text-muted">No attempts remain. Contact your training team if you need another attempt.</p> : null}
        {error ? <p role="alert" className="rounded-control bg-destructive-tint px-3 py-2 text-sm text-destructive-text">{error}</p> : null}
        {windowOpen && !exhausted ? (
          <Button
            disabled={phase === "consent" || busy}
            onClick={() => {
              // consent interstitial only for monitored assessments (spec FR-7.4)
              setPhase("consent");
            }}
          >
            {busy ? "Preparing…" : resume ? "Resume attempt" : "Start assessment"}
          </Button>
        ) : null}
        {latestFinalized && latestFinalized.gradingState === "FINAL" && !latestFinalized.appealed && !appealSent ? (
          <button
            className="link text-sm text-link"
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
          <p className="display mb-1 text-xl">
            <AnimatedNumber value={result.scorePct} suffix="%" />
          </p>
          {resultStatus(result) === "pending" ? (
            <div>
              <Chip variant="warning">Pending confirmation</Chip>
              <p className="mt-2 text-sm text-muted">
                A human reviewer confirms AI-graded answers before this result is final. Your compliance status is not
                affected until then. You&#39;ll get a notification.
              </p>
            </div>
          ) : resultStatus(result) === "pass" ? (
            <Chip variant="success">Final result: passed</Chip>
          ) : (
            <Chip variant="destructive">Final result: not passed</Chip>
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
                  {r.correct === null ? <Chip variant="ai">AI-graded</Chip> : r.correct ? <Chip variant="success">Correct</Chip> : <Chip variant="destructive">Incorrect</Chip>}
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
        <div className="flex flex-wrap gap-2">{lessonHref ? <ButtonLink href={lessonHref}>Return to lesson</ButtonLink> : null}<Button variant="secondary" onClick={() => { setPhase("preflight"); setResult(null); router.refresh(); }}>Review attempts and retry</Button></div>
      </div>
    );
  }

  /* ---------------- running ---------------- */
  if (!settings) return null;
  const visible = settings.oneAtATime ? [served[index]] : served;
  const answeredCount = served.filter((s) => isAnswered(s, answers[s.questionId])).length;

  return (
    <div>
      <div className="sticky top-12 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-3 py-2 text-sm">
        <span className="text-muted">{answeredCount}/{served.length} answered</span>
        <span className="flex-1" />
        {offline ? <Chip variant="warning">Not saved — keep this tab open</Chip> : <span className={cx("text-xs text-muted transition-opacity", saved ? "opacity-100" : "opacity-60")}>{saved ? <><Icon name="check" size={12} className="me-1 inline align-text-bottom text-success-fg" />Saved</> : "Unsaved changes"}</span>}
        {remaining !== null ? (
          <Chip variant={remaining < 60 ? "destructive" : "neutral"}>
            {remaining <= 0 ? "Time up" : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
          </Chip>
        ) : null}
      </div>

      {error ? <p role="alert" className="mb-4 rounded-control bg-warning-tint p-3 text-sm text-warning-fg">{error}</p> : null}
      <nav aria-label="Question navigation" className="mb-4 flex flex-wrap gap-2">{served.map((q, i) => <button key={q.questionId} type="button" disabled={busy || (settings.noBacktrack && i < index)} aria-current={settings.oneAtATime && index === i ? "step" : undefined} aria-label={`Question ${i + 1}, ${isAnswered(q, answers[q.questionId]) ? "answered" : "unanswered"}`} className={cx("touch-target rounded-control border px-3 text-sm", index === i ? "border-primary bg-accent-tint text-primary" : "border-border", "disabled:opacity-50")} onClick={() => { if (settings.oneAtATime) setIndex(i); else document.getElementById(`question-${q.questionId}`)?.scrollIntoView({ block: "center" }); }}>{i + 1}</button>)}</nav>
      <fieldset disabled={busy} aria-label="Assessment answers" aria-busy={busy} className="min-w-0">
        {visible.map((q) => (
          <QuestionInput key={q.questionId} q={q} answer={answers[q.questionId]} onChange={(a) => setAnswer(q.questionId, a)} />
        ))}
      </fieldset>

      <div className="mt-4 flex items-center gap-2">
        {settings.oneAtATime && index > 0 && !settings.noBacktrack ? (
          <Button disabled={busy} variant="secondary" onClick={() => setIndex((i) => i - 1)}>Back</Button>
        ) : null}
        {settings.oneAtATime && index < served.length - 1 ? (
          <Button disabled={busy} onClick={() => setIndex((i) => i + 1)}>Next</Button>
        ) : (
          <Button disabled={busy} onClick={() => answeredCount < served.length ? setConfirmSubmit(true) : void submit()}>{busy ? "Submitting…" : "Submit assessment"}</Button>
        )}
      </div>
      <Dialog open={confirmSubmit} onClose={() => setConfirmSubmit(false)} title="Submit with unanswered questions?">
        <p className="mb-4 text-muted">{served.length - answeredCount} question(s) are unanswered or incomplete. You can review them before submitting.</p>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setConfirmSubmit(false)}>Keep answering</Button><Button disabled={busy} onClick={() => { setConfirmSubmit(false); void submit(); }}>Submit anyway</Button></div>
      </Dialog>
    </div>
  );
}

/** Consent interstitial for monitored assessments (spec FR-7.4) — an L2 dialog, never a bare card. */
function ConsentGate({ quizId, onProceed, onCancel }: { quizId: string; onProceed: () => void; onCancel: () => void }) {
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`/api/quiz/${quizId}/consent-info`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        if (!d.integrityMode) onProceed();
        else setNeedsConsent(true);
      })
      .catch(() => setConsentError("Consent information could not load. Please cancel and try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);
  if (needsConsent === null) return <div><p role="status" className="text-sm text-muted">{consentError ?? "Preparing…"}</p>{consentError ? <Button variant="secondary" onClick={onCancel}>Back</Button> : null}</div>;
  const fsSupported = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
  return (
    <Dialog open onClose={onCancel} title="Before you start — what this assessment records">
      <ul className="mb-3 flex list-disc flex-col gap-1 ps-6 text-sm">
        <li>When you leave this screen or switch apps (timestamps only)</li>
        {fsSupported ? <li>Fullscreen is requested; leaving it is recorded for review</li> : <li>Fullscreen isn’t available on this device — only screen-leave events are recorded</li>}
        <li>Copy and paste are disabled during the assessment</li>
        <li><strong>No camera. No microphone. No screen recording.</strong></li>
      </ul>
      <p className="mb-6 text-sm text-muted">
        Why: this keeps certifications fair. A person — never software — reviews any flags before they affect you. Events
        are deleted 6 months after the result is final. If you prefer, ask your manager for a supervised in-person sitting instead.
      </p>
      {consentError ? <p role="alert" className="mb-3 text-sm text-destructive-text">{consentError}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          autoFocus disabled={consentBusy}
          onClick={async () => {
            setConsentBusy(true);
            setConsentError(null);
            try {
              const response = await fetch(`/api/quiz/${quizId}/consent-info`, { method: "POST" });
              if (!response.ok) throw new Error();
              onProceed();
            } catch {
              setConsentError("Acknowledgment could not be saved. Please try again.");
            } finally {
              setConsentBusy(false);
            }
          }}
        >
          I understand — start
        </Button>
      </div>
    </Dialog>
  );
}
