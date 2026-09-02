"use client";

import type { HrCitation } from "@/lib/db/schema";

/**
 * Policy citation chips (spec FR-8.4 / §10.6): every chip previews (title
 * attribute) AND deep-links to the policy section. Shared by the text chat and
 * the voice captions. Chips stay LTR inside RTL text (bidi-isolate).
 */
export function CitationChips({ citations, className }: { citations: HrCitation[]; className?: string }) {
  if (citations.length === 0) return null;
  return (
    <span className={`mt-2 flex flex-wrap gap-2 ${className ?? ""}`}>
      {citations.map((c, i) => (
        <a
          key={`${c.docId}-${c.sectionPath}-${i}`}
          href={`/policy/${c.docId}?section=${encodeURIComponent(c.sectionPath)}`}
          title={`${c.title} — v${c.version}, effective ${c.effectiveDate}`}
          className="bidi-isolate pressable hit-area rounded-full bg-surface px-2 py-1 text-xs font-medium text-ai-fg hover:opacity-80"
          onClick={() => {
            void fetch("/api/events", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ kind: "hr_citation_click", payload: { docId: c.docId } }),
            }).catch(() => {});
          }}
        >
          § {c.title} · {c.sectionPath.length > 24 ? `${c.sectionPath.slice(0, 24)}…` : c.sectionPath}
        </a>
      ))}
    </span>
  );
}
