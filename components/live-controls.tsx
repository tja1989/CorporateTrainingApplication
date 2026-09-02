"use client";

import { useEffect, useState } from "react";
import { Button, Chip, Input, PillButton } from "@/components/ui";
import type { VoiceStatus } from "@/lib/live/client/use-live-voice";

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Sticky control bar for a voice session: mute, typed input (always
 * available — noisy rooms, no mic, demo mode), elapsed time, model/mode chip,
 * token expiry and the End action.
 */
export function LiveControls({
  status,
  muted,
  typedOnly,
  mock,
  model,
  elapsedSec,
  expiresAt,
  onToggleMute,
  onSendText,
  onEnd,
  endLabel = "End",
}: {
  status: VoiceStatus;
  muted: boolean;
  typedOnly: boolean;
  mock: boolean;
  model: string | null;
  elapsedSec: number;
  expiresAt: string | null;
  onToggleMute: () => void;
  onSendText: (text: string) => void;
  onEnd: () => void;
  endLabel?: string;
}) {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const live = status === "live";
  const showTyping = typing || typedOnly;
  const expiresIn = expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60_000)) : null;

  return (
    <div className="composer-sticky border-t border-border bg-background pb-2 pt-2">
      {showTyping ? (
        <form
          className="mb-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            onSendText(text);
            setText("");
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mock ? "Type your message…" : "Type instead of speaking…"}
            disabled={!live}
            aria-label="Type a message"
            dir="auto"
            autoFocus={typedOnly}
          />
          <Button type="submit" variant="secondary" disabled={!live || !text.trim()}>
            Send
          </Button>
        </form>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {!typedOnly ? (
          <>
            <PillButton type="button" active={muted} onClick={onToggleMute} disabled={!live} aria-pressed={muted}>
              {muted ? "Unmute" : "Mute"}
            </PillButton>
            <PillButton type="button" active={typing} onClick={() => setTyping((v) => !v)} disabled={!live} aria-pressed={typing}>
              Type instead
            </PillButton>
          </>
        ) : null}
        <span className="text-xs tabular-nums text-muted" aria-label="Elapsed time">
          {mmss(elapsedSec)}
        </span>
        <Chip variant="ai">{mock ? "offline demo" : (model ?? "…")}</Chip>
        {expiresIn !== null && !mock ? <span className="text-xs text-muted">session token · {expiresIn} min left</span> : null}
        <div className="flex-1" />
        <Button type="button" variant="destructive" onClick={onEnd} disabled={!live && status !== "connecting" && status !== "mic"}>
          {endLabel}
        </Button>
      </div>
    </div>
  );
}
