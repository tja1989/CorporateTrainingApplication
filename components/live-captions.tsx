"use client";

import { useEffect, useRef } from "react";
import { AiSurface } from "@/components/ai-surface";
import { CitationChips } from "@/components/citations";
import type { Turn } from "@/lib/live/shared";

/** Minimal inline markdown (**bold**, _italic_, *italic*) — answers quote policy text that carries it. */
function renderLite(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*\n]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("_") && part.endsWith("_")) || (part.startsWith("*") && part.endsWith("*"))) return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Live captions for a voice session: the learner's words plain, the
 * assistant's inside the AI surface, both flowing in the page (no inner
 * scroller — spec §10.7). Follows the conversation only while the reader is
 * already near the bottom.
 */
export function LiveCaptions({ turns, emptyHint }: { turns: Turn[]; emptyHint?: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  useEffect(() => {
    function onScroll() {
      stickRef.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView({ block: "end", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [turns]);

  return (
    <div className="flex flex-col gap-3" dir="auto" aria-label="Transcript">
      {turns.length === 0 && emptyHint ? <p className="text-sm text-muted">{emptyHint}</p> : null}
      {turns.map((t) =>
        t.role === "user" ? (
          <div key={t.id} className="max-w-[85%] self-end rounded-card bg-surface-2 px-3 py-2 text-sm" dir="auto">
            {t.text}
            {!t.final ? <span className="stream-cursor ms-1" aria-hidden /> : null}
          </div>
        ) : (
          <AiSurface key={t.id} mock={t.mock} className="max-w-[85%] self-start">
            <p className="whitespace-pre-wrap text-sm" dir="auto">
              {renderLite(t.text)}
              {!t.final ? <span className="stream-cursor ms-1" aria-hidden /> : null}
            </p>
            {t.citations?.length ? <CitationChips citations={t.citations} /> : null}
          </AiSurface>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
