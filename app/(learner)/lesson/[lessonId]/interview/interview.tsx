"use client";

import { useState } from "react";
import { useLiveVoice } from "@/lib/live/client/use-live-voice";
import type { Evaluation } from "@/lib/live/shared";
import { VoiceOrb } from "@/components/voice-orb";
import { LiveCaptions } from "@/components/live-captions";
import { LiveControls } from "@/components/live-controls";
import { VoiceConsent } from "@/components/voice-consent";
import { ConfirmDialog } from "@/components/dialog";
import { AiSurface, AnimatedNumber, Button, ButtonLink, Card, Chip } from "@/components/ui";

export type OralResult = {
  scorePct: number | null;
  outcome: string | null;
  evaluation: Evaluation | null;
  evaluationSource: string | null;
  completedAt?: string | null;
};

export function OralCheck({
  lessonId,
  configured,
  questionCount,
  maxMinutes,
  passPct,
  gating,
  previous,
  backHref,
}: {
  lessonId: string;
  configured: boolean;
  questionCount: number;
  maxMinutes: number;
  passPct: number;
  /** INTERVIEW lessons: passing completes the lesson. */
  gating?: boolean;
  previous: OralResult | null;
  backHref: string;
}) {
  const v = useLiveVoice({
    kind: "interview",
    sessionUrl: "/api/live/interview/session",
    eventUrl: "/api/live/interview/event",
    sessionBody: { lessonId },
    maxMinutes,
  });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const idle = v.status === "idle";
  const over = v.status === "ended" || v.status === "error";
  const result: OralResult | null = v.result ? { ...v.result } : null;

  return (
    <div className="flex flex-col gap-4">
      {idle && previous ? <ResultCard title="Your last result" result={previous} passPct={passPct} gating={gating} /> : null}
      {idle ? (
        <VoiceConsent
          kind="interview"
          configured={configured}
          questionCount={questionCount}
          maxMinutes={maxMinutes}
          gating={gating}
          starting={false}
          startLabel={previous ? "Retake the oral check" : undefined}
          onStart={() => void v.start()}
          onTestSpeaker={v.testSpeaker}
        />
      ) : null}

      {!idle ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <VoiceOrb status={v.status} speaking={v.speaking} level={v.level} muted={v.muted} typedOnly={v.typedOnly} />
            <div className="text-end text-xs text-muted">
              <p>up to {questionCount} questions</p>
              <p>{maxMinutes} min max · pass mark {passPct}%</p>
            </div>
          </div>
          {v.warning ? <p className="text-center text-xs text-muted">{v.warning}</p> : null}
          {v.error ? <p className="text-center text-xs text-destructive-text">{v.error}</p> : null}
          <LiveCaptions turns={v.turns} emptyHint={v.status === "live" ? "The interviewer will start in a moment." : undefined} />
          {over ? (
            result?.evaluation || result?.scorePct !== null ? (
              <>
                {result ? <ResultCard title="Your result" result={result} passPct={passPct} gating={gating} /> : null}
                <div className="flex gap-2">
                  <ButtonLink href={backHref}>Back to course</ButtonLink>
                  <Button variant="secondary" onClick={() => void v.start()}>
                    Retake
                  </Button>
                </div>
              </>
            ) : (
              <Card className="p-4">
                <p className="text-sm text-muted">{v.status === "error" ? "The session could not continue." : "The check ended before any answers were recorded — nothing was saved."}</p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => void v.start()}>Try again</Button>
                  <ButtonLink variant="secondary" href={backHref}>
                    Back to course
                  </ButtonLink>
                </div>
              </Card>
            )
          ) : (
            <LiveControls
              status={v.status}
              muted={v.muted}
              typedOnly={v.typedOnly}
              mock={v.mock}
              model={v.model}
              elapsedSec={v.elapsedSec}
              expiresAt={v.expiresAt}
              onToggleMute={v.toggleMute}
              onSendText={v.sendText}
              onEnd={() => setConfirmEnd(true)}
              endLabel="End early"
            />
          )}
        </>
      ) : null}

      <ConfirmDialog
        open={confirmEnd}
        title="End the oral check early?"
        body="What you've said so far will be graded from the transcript and flagged for a person to review."
        confirmLabel="End now"
        destructive
        onConfirm={() => {
          setConfirmEnd(false);
          void v.stop();
        }}
        onCancel={() => setConfirmEnd(false)}
      />
    </div>
  );
}

export function ResultCard({ title, result, passPct, gating }: { title: string; result: OralResult; passPct?: number; gating?: boolean }) {
  const ev = result.evaluation;
  const pct = result.scorePct ?? 0;
  const pass = result.outcome === "PASS";
  const afterTheFact = result.evaluationSource === "fallback" || result.evaluationSource === "mock";
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{title}</p>
          <p className="text-xl font-medium">
            <AnimatedNumber value={pct} suffix="%" />
          </p>
        </div>
        <Chip variant={pass ? "success" : "warning"}>{pass ? "Passed" : "Not passed"}</Chip>
      </div>
      <p className="mb-3 text-xs text-muted">
        {passPct !== undefined ? `Pass mark ${passPct}%. ` : ""}
        {pass
          ? gating
            ? "This lesson is now complete."
            : "Nice work."
          : `Not passed this time — you can retake it whenever you're ready.${gating ? " The lesson completes when you pass." : ""}`}
        {afterTheFact ? " Graded from the transcript after the session; an admin may review it." : !pass ? " An admin can review and overturn a fail." : ""}
      </p>
      {ev ? (
        <AiSurface variant="block" label="AI evaluation" mock={result.evaluationSource === "mock"} className="block max-w-full">
          {ev.overall_summary ? <p className="mb-2">{ev.overall_summary}</p> : null}
          <ol className="flex flex-col gap-2">
            {ev.questions.map((q, i) => (
              <li key={i} className="rounded-control bg-surface px-3 py-2">
                <p className="font-medium">{q.question}</p>
                <p className="text-xs text-muted">You said: {q.answer_summary || "—"}</p>
                <p className="text-xs">
                  {q.feedback} <span className="text-muted">· {q.score}/3</span>
                </p>
              </li>
            ))}
          </ol>
        </AiSurface>
      ) : null}
      {result.completedAt ? <p className="mt-2 text-xs text-muted">{new Date(result.completedAt).toLocaleString()}</p> : null}
    </Card>
  );
}
