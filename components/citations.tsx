"use client";

import type { LiveCitation } from "@/lib/db/schema";
import { Icon } from "./icons";

/**
 * Citation chips (spec FR-8.4 / §10.6): every chip previews (title attribute)
 * AND deep-links — policy sections to the policy viewer, lessons to the lesson.
 * Shared by the text chat and the voice captions. Chips stay LTR inside RTL
 * text (bidi-isolate).
 */
export function CitationChips({ citations, className }: { citations: LiveCitation[]; className?: string }) {
  if (citations.length === 0) return null;
  const chip = "bidi-isolate pressable touch-target inline-flex items-center gap-1 rounded-control bg-surface px-2 py-1 text-sm font-medium text-ai-fg hover:bg-accent-tint";
  return (
    <span className={`mt-2 flex flex-wrap gap-2 ${className ?? ""}`}>
      {citations.map((c, i) =>
        c.kind === "lesson" ? (
          <a key={`lesson-${c.lessonId}-${i}`} href={c.href} title={`${c.courseTitle} › ${c.title}`} className={chip}>
            <Icon name="play" size={12} /> {c.courseTitle} · {c.title.length > 28 ? `${c.title.slice(0, 28)}…` : c.title}
          </a>
        ) : (
          <a
            key={`${c.docId}-${c.sectionPath}-${i}`}
            href={`/policy/${c.docId}?section=${encodeURIComponent(c.sectionPath)}`}
            title={`${c.title} — v${c.version}, effective ${c.effectiveDate}`}
            className={chip}
            onClick={() => {
              void fetch("/api/events", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind: "hr_citation_click", payload: { docId: c.docId } }),
              }).catch(() => {});
            }}
          >
            <Icon name="section" size={12} /> {c.title} · {c.sectionPath.length > 24 ? `${c.sectionPath.slice(0, 24)}…` : c.sectionPath}
          </a>
        ),
      )}
    </span>
  );
}
