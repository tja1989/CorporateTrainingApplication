"use client";

import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE_IN_OUT, EASE_OUT } from "@/lib/motion";
import type { VoiceStatus } from "@/lib/live/client/use-live-voice";

/**
 * The voice presence: an `--ai` tinted disc that swells with the microphone
 * level while listening and breathes while the assistant speaks. Motion is
 * on the shared duration/easing tokens; reduced-motion users get a static disc
 * and the live status text (spec §10.5, FR-14).
 */
export function VoiceOrb({ status, speaking, level, muted, typedOnly }: { status: VoiceStatus; speaking: boolean; level: number; muted: boolean; typedOnly: boolean }) {
  const reduced = useReducedMotion();
  const label =
    status === "mic" ? "Allow the microphone…"
    : status === "connecting" ? "Connecting"
    : status === "live" ? (speaking ? "Speaking" : muted ? "Muted" : typedOnly ? "Ready — type below" : "Listening")
    : status === "ending" ? "Wrapping up"
    : status === "ended" ? "Ended"
    : status === "error" ? "Not connected"
    : "Ready";
  const listening = status === "live" && !speaking && !muted && !typedOnly;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex size-[96px] items-center justify-center">
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-ai"
          animate={speaking && !reduced ? { scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] } : { scale: 1, opacity: status === "live" ? 0.7 : 0.35 }}
          transition={speaking && !reduced ? { duration: DUR.slow * 3, ease: EASE_IN_OUT, repeat: Infinity } : { duration: DUR.base, ease: EASE_OUT }}
        />
        <motion.div
          aria-hidden
          className="flex size-[64px] items-center justify-center rounded-full bg-ai-tint text-xl text-ai-fg"
          animate={{ scale: reduced ? 1 : speaking ? 1.06 : listening ? 1 + Math.min(1, level) * 0.35 : 1 }}
          transition={{ duration: DUR.fast, ease: EASE_OUT }}
        >
          ✳
        </motion.div>
      </div>
      <p className="text-xs text-muted" role="status" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
