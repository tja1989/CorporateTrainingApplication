"use client";

import type { VoiceStatus } from "@/lib/live/client/use-live-voice";
import { Icon } from "./icons";

/**
 * The voice presence: an `--ai` tinted disc that swells with the microphone
 * level while listening and breathes while the assistant speaks. Motion is
 * on the shared duration/easing tokens; reduced-motion users get a static disc
 * and the live status text (spec §10.5, FR-14).
 */
export function VoiceOrb({ status, speaking, level, muted, typedOnly }: { status: VoiceStatus; speaking: boolean; level: number; muted: boolean; typedOnly: boolean }) {
  const label =
    status === "mic" ? "Allow the microphone…"
    : status === "connecting" ? "Connecting"
    : status === "reconnecting" ? "Reconnecting"
    : status === "live" ? (speaking ? "Responding" : muted ? "Muted" : typedOnly ? "Ready — type below" : "Listening")
    : status === "ending" ? "Wrapping up"
    : status === "ended" ? "Ended"
    : status === "error" ? "Not connected"
    : "Ready";
  return <div className="flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-control bg-ai-tint text-ai-fg" aria-hidden><Icon name="mic" size={24} /></span><p className="text-sm font-medium" role="status" aria-live="polite">{label}</p></div>;
}
