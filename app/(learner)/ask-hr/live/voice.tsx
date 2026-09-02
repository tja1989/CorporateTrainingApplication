"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveVoice } from "@/lib/live/client/use-live-voice";
import { VoiceOrb } from "@/components/voice-orb";
import { LiveCaptions } from "@/components/live-captions";
import { LiveControls } from "@/components/live-controls";
import { VoiceConsent } from "@/components/voice-consent";
import { CitationChips } from "@/components/citations";
import { ConfirmDialog } from "@/components/dialog";
import { Button, ButtonLink, Card, Chip, PillButton, PillLink } from "@/components/ui";

export function HrVoice({ configured, sharedDevice }: { configured: boolean; sharedDevice: boolean }) {
  const v = useLiveVoice({ kind: "hr", sessionUrl: "/api/live/hr/session", eventUrl: "/api/live/hr/event" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [locked, setLocked] = useState(sharedDevice);
  const idle = v.status === "idle";
  const over = v.status === "ended" || v.status === "error";

  if (locked) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-xl text-muted" aria-hidden>✳</p>
        <h2 className="font-medium">Your HR conversations are private</h2>
        <p className="max-w-sm text-sm text-muted">You signed in on a shared device, so voice mode waits until you confirm it&#39;s you.</p>
        <Button onClick={() => setLocked(false)}>It&#39;s me — continue</Button>
      </Card>
    );
  }

  return (
    <section aria-label="HR assistant — voice" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          HR Assistant <Chip variant="ai">AI</Chip>
        </span>
        <span className="flex gap-2">
          <PillLink href="/ask-hr">Text chat</PillLink>
          {v.status === "live" ? <PillButton onClick={() => setConfirmOpen(true)}>Talk to a person</PillButton> : null}
        </span>
      </div>
      {/* FR-8.10: the AI disclosure is fixed UI text, not something the model has to remember to say */}
      <p className="text-sm text-muted">
        👋 You&#39;re talking to an <strong>AI assistant</strong> that answers questions about company HR policies and cites the exact policy text. It doesn&#39;t make
        decisions — HR does.
      </p>

      {idle ? <VoiceConsent kind="hr" configured={configured} starting={false} onStart={() => void v.start()} onTestSpeaker={v.testSpeaker} /> : null}

      {!idle ? (
        <>
          <VoiceOrb status={v.status} speaking={v.speaking} level={v.level} muted={v.muted} typedOnly={v.typedOnly} />
          {v.warning ? <p className="text-center text-xs text-muted">{v.warning}</p> : null}
          {v.error ? <p className="text-center text-xs text-destructive-text">{v.error}</p> : null}
          <LiveCaptions turns={v.turns} emptyHint={v.status === "live" ? "Say hello — or type below." : undefined} />
          {v.citations.length > 0 ? (
            <Card className="p-3">
              <p className="text-xs text-muted">Policies cited in this conversation</p>
              <CitationChips citations={v.citations} />
            </Card>
          ) : null}
          {v.ticketId ? (
            <p className="text-sm">
              <Chip variant="success">Ticket sent to HR</Chip>{" "}
              <Link href={`/ask-hr/tickets/${v.ticketId}`} className="text-primary underline">
                View the ticket
              </Link>
            </p>
          ) : null}
          {over ? (
            <Card className="flex flex-wrap items-center gap-2 p-4">
              <p className="flex-1 text-sm text-muted">
                {v.status === "error" ? "The session could not continue." : `Conversation ended${v.closeInfo?.reason ? ` (${v.closeInfo.reason})` : ""}. Your transcript is saved in the text chat.`}
              </p>
              <Button onClick={() => void v.start()}>Talk again</Button>
              <ButtonLink variant="secondary" href="/ask-hr">
                Continue in text
              </ButtonLink>
            </Card>
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
              onEnd={() => void v.stop()}
              endLabel="End conversation"
            />
          )}
        </>
      ) : null}

      <ConfirmDialog
        open={confirmOpen || v.pendingEscalation}
        title="Share this conversation with HR?"
        body="Your name and this conversation will be shared with the HR team so a person can help. Nothing is shared until you confirm."
        confirmLabel="Share and create ticket"
        onConfirm={() => {
          setConfirmOpen(false);
          void v.escalate();
        }}
        onCancel={() => {
          setConfirmOpen(false);
          v.dismissEscalation();
        }}
      />
    </section>
  );
}
