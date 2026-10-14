"use client";

import { Icon, IconDisc } from "@/components/icons";
import Link from "next/link";
import { useState } from "react";
import { useLiveVoice } from "@/lib/live/client/use-live-voice";
import { VoiceOrb } from "@/components/voice-orb";
import { LiveCaptions } from "@/components/live-captions";
import { LiveControls } from "@/components/live-controls";
import { VoiceConsent } from "@/components/voice-consent";
import { CitationChips } from "@/components/citations";
import { EscalationPreview } from "@/components/escalation-preview";
import { Button, ButtonAnchor, Card, Chip, PillButton, PillLink } from "@/components/ui";

const SUGGESTED = [
  "How many days of annual leave do I get?",
  "What training is due for me?",
  "What does the cold chain lesson say?",
  "How should I greet a customer?",
];

export function HrVoice({ configured, sharedDevice, demoMode, firstName }: { configured: boolean; sharedDevice: boolean; demoMode?: boolean; firstName?: string }) {
  const v = useLiveVoice({ configured, kind: "hr", sessionUrl: "/api/live/hr/session", eventUrl: "/api/live/hr/event" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [locked, setLocked] = useState(sharedDevice);
  const idle = v.status === "idle";
  const over = v.status === "ended" || v.status === "error";

  if (locked) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <IconDisc name="sparkle" tone="ai" size={56} className="animate-pop" />
        <h2 className="display text-lg">Your HR conversations are private</h2>
        <p className="max-w-sm text-sm text-muted">You can start a new conversation on this shared device. Opening stored HR history requires password verification in HR Help.</p>
        <Button onClick={() => setLocked(false)}>Continue to voice</Button>
      </Card>
    );
  }

  return (
    <section aria-label="HR assistant — voice" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          Your assistant <Chip variant="ai">AI</Chip>
        </span>
        <span className="flex flex-wrap gap-2">
          <PillLink href="/ask-hr">Text chat</PillLink>
          {v.status === "live" ? <PillButton onClick={() => setConfirmOpen(true)}>Talk to a person</PillButton> : null}
        </span>
      </div>
      {/* FR-8.10: the AI disclosure is fixed UI text, not something the model has to remember to say */}
      <p className="text-sm text-muted">
        <Icon name="wave" size={16} className="me-1 inline align-text-bottom text-ai-fg" /> {firstName ? `${firstName}, you're` : "You're"} talking to an <strong>AI assistant</strong> that quotes company HR policy and your own course lessons, and knows
        what training you have due. It cites its sources and doesn&#39;t make decisions — HR does.
      </p>
      {demoMode ? (
        <details className="rounded-card border border-border bg-surface px-3 py-2 text-sm">
          <summary className="touch-target flex items-center text-xs font-medium text-muted">Demo tips</summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
            <li>1. Tap Start, allow the microphone, and wait for the greeting — the assistant speaks first.</li>
            <li>2. Ask a policy question, then a follow-up (&quot;and sick leave?&quot;) — it re-checks the policy each time.</li>
            <li>3. Ask &quot;what training is due for me?&quot; — the answer comes from your real enrollments.</li>
            <li>4. Ask about a lesson (&quot;what does the cold chain lesson say?&quot;) — the chip links to the lesson.</li>
            <li>5. Say &quot;I want to talk to a person&quot; — nothing is shared until you confirm on screen.</li>
            <li>Noisy room? Use the suggested prompts or &quot;Type instead&quot; — same session, same tools.</li>
          </ul>
        </details>
      ) : null}

      {idle ? <VoiceConsent kind="hr" configured={configured} starting={false} onStart={() => void v.start()} onStartTyped={() => void v.start(true)} onTestSpeaker={v.testSpeaker} /> : null}

      {!idle ? (
        <>
          <VoiceOrb status={v.status} speaking={v.speaking} level={v.level} muted={v.muted} typedOnly={v.typedOnly} />
          {v.warning ? <p className="text-center text-xs text-muted">{v.warning}</p> : null}
          {v.error ? <p className="text-center text-xs text-destructive-text">{v.error}</p> : null}
          <LiveCaptions turns={v.turns} emptyHint={v.status === "live" ? "Say hello — or tap a suggestion below." : undefined} />
          {v.status === "live" ? (
            <div className="flex flex-wrap gap-2" aria-label="Try asking">
              {SUGGESTED.map((q) => (
                <PillButton key={q} type="button" onClick={() => v.sendText(q)}>
                  {q}
                </PillButton>
              ))}
            </div>
          ) : null}
          {v.citations.length > 0 ? (
            <Card className="p-3">
              <p className="text-xs text-muted">Sources cited in this conversation</p>
              <CitationChips citations={v.citations} />
            </Card>
          ) : null}
          {v.ticketId ? (
            <p className="text-sm">
              <Chip variant="success">Ticket sent to HR</Chip>{" "}
              <a href={`/ask-hr/tickets/${v.ticketId}`} className="link text-link">
                View the ticket
              </a>
            </p>
          ) : null}
          {over ? (
            <Card className="flex flex-wrap items-center gap-2 p-4">
              <p className="flex-1 text-sm text-muted">
                {v.status === "error" ? "The session could not continue." : `Conversation ended${v.closeInfo?.reason ? ` (${v.closeInfo.reason})` : ""}. Your transcript is saved in the text chat.`}
              </p>
              <Button onClick={() => void v.start()}>Talk again</Button>
              <ButtonAnchor variant="secondary" href="/ask-hr">
                Continue in text
              </ButtonAnchor>
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
              onTypeInstead={v.continueTyping}
              onSendText={v.sendText}
              onEnd={() => void v.stop()}
              endLabel="End conversation"
            />
          )}
        </>
      ) : null}

      <EscalationPreview
        open={confirmOpen || v.pendingEscalation}
        load={v.previewEscalation}
        confirm={async (version) => { await v.escalate(version); }}
        close={() => {
          setConfirmOpen(false);
          v.dismissEscalation();
        }}
      />
    </section>
  );
}
