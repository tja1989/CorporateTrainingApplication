"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, PillButton } from "@/components/ui";

/**
 * Per-session consent for voice features (spec FR-14.4): says exactly what is
 * captured, where it goes, what is kept and who sees it — and offers typing.
 */
export function VoiceConsent({
  kind,
  configured,
  questionCount,
  maxMinutes,
  starting,
  onStart,
  onTestSpeaker,
  startLabel,
  gating,
}: {
  kind: "hr" | "interview";
  startLabel?: string;
  /** INTERVIEW lessons: passing completes the lesson (and may be required). */
  gating?: boolean;
  configured: boolean;
  questionCount?: number;
  maxMinutes?: number;
  starting: boolean;
  onStart: () => void;
  onTestSpeaker: () => void;
}) {
  const [micOk, setMicOk] = useState(true);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setMicOk(!!navigator.mediaDevices?.getUserMedia && window.isSecureContext);
    setIos(/iPhone|iPad/.test(navigator.userAgent));
  }, []);
  return (
    <Card className="p-4">
      <h2 className="mb-2 text-base font-medium">{kind === "hr" ? "Before you talk to the HR assistant" : "Before the oral check"}</h2>
      <ul className="mb-3 flex flex-col gap-2 text-sm">
        <li className="flex gap-2">
          <span aria-hidden>🎙</span>
          <span>
            Your microphone is on only while this page is open. Audio streams to Google&#39;s Gemini API to be understood and answered — we never store the
            audio.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden>📝</span>
          <span>
            A written transcript is kept for 12 months.{" "}
            {kind === "hr" ? "It's yours — the HR team sees it only if you choose to share it." : "Your manager and admins can see it, like a quiz result."}
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden>✳</span>
          <span>
            You&#39;re talking to an AI.{" "}
            {kind === "hr"
              ? "It quotes HR policy and your own course lessons, and can tell you what training is due. It never makes decisions — HR does. Answers are in English for now."
              : `It asks up to ${questionCount ?? 3} short questions — about three minutes, ${maxMinutes ?? 6} at most. ${gating ? "Passing completes this lesson; you can retake it if you don't pass." : "The result never blocks a course completion."}`}
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden>⌨</span>
          <span>Prefer not to speak? You can type instead at any point.</span>
        </li>
        {ios ? (
          <li className="flex gap-2">
            <span aria-hidden>📱</span>
            <span>On iPhone, switch the ringer on to hear the assistant.</span>
          </li>
        ) : null}
      </ul>
      {!configured ? (
        <p className="mb-3 text-xs text-muted">Offline demo mode — no Gemini key is configured, so this runs typed, with the same policy tools and grading.</p>
      ) : !micOk ? (
        <p className="mb-3 text-xs text-muted">No microphone access in this browser (voice needs HTTPS and a mic) — you&#39;ll type instead.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onStart} disabled={starting}>
          {starting ? "Starting…" : (startLabel ?? (kind === "hr" ? "Start talking" : "Start the oral check"))}
        </Button>
        <PillButton type="button" onClick={onTestSpeaker}>
          Test speaker
        </PillButton>
        <Link href="/privacy-notice" className="text-xs text-primary underline">
          Privacy notice
        </Link>
      </div>
    </Card>
  );
}
