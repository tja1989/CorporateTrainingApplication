import { cx } from "@/components/ui";
import type { LessonState, LessonType } from "@/lib/lms/outline";

/**
 * Lesson type icons for the course outline (spec §11.4).
 *
 * Drawn rather than typed: the glyphs this replaced (▶ ¶ ▦ ☑ 🎙) render at
 * different weights per platform and the microphone arrives as a colour emoji,
 * which the closed palette cannot tone down. These are one 16px line set on the
 * same hairline weight as the rest of the chrome, in `currentColor`, sized by
 * SVG attributes — the theme declares no `--spacing-5`, so a classed `size-5`
 * would silently emit nothing.
 *
 * Completion and lock are drawn *beside* the type, never over it: a learner
 * scanning what is left still needs to see what each item is.
 */

const TILE: Record<LessonState, string> = {
  done: "bg-success-tint text-success-fg",
  current: "bg-primary text-primary-fg",
  locked: "bg-surface-2 text-muted",
  todo: "bg-surface-2 text-muted",
};

const TYPE_LABEL: Record<LessonType, string> = {
  VIDEO: "Video",
  TEXT: "Article",
  PDF: "Document",
  QUIZ: "Quiz",
  INTERVIEW: "Oral check",
};

export function lessonTypeLabel(type: LessonType): string {
  return TYPE_LABEL[type] ?? "Lesson";
}

const svg = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function TypeGlyph({ type }: { type: LessonType }) {
  switch (type) {
    case "VIDEO":
      return (
        <svg {...svg}>
          <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2.25" />
          <path d="M6.6 6.35 10.1 8l-3.5 1.65z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "TEXT":
      return (
        <svg {...svg}>
          <rect x="3" y="2.25" width="10" height="11.5" rx="2" />
          <path d="M5.5 5.75h5M5.5 8h5M5.5 10.25h3" />
        </svg>
      );
    case "PDF":
      return (
        <svg {...svg}>
          <path d="M3.75 3a1.25 1.25 0 0 1 1.25-1.25h3.75L12.25 5.25V13A1.25 1.25 0 0 1 11 14.25H5A1.25 1.25 0 0 1 3.75 13z" />
          <path d="M8.75 1.75v3.5h3.5" />
        </svg>
      );
    case "QUIZ":
      return (
        <svg {...svg}>
          <rect x="3" y="2.25" width="10" height="11.5" rx="2" />
          <path d="m5.6 6.4 1.25 1.25L9.1 5.4" />
          <path d="M5.6 10.4h4.8" />
        </svg>
      );
    case "INTERVIEW":
      return (
        <svg {...svg}>
          <rect x="6.25" y="1.75" width="3.5" height="7" rx="1.75" />
          <path d="M4.25 7.25a3.75 3.75 0 0 0 7.5 0" />
          <path d="M8 11v2.5" />
        </svg>
      );
    default:
      return null;
  }
}

/** The type tile at the head of an outline row. Tinted by state, never replaced by it. */
export function LessonIcon({ type, state = "todo", className }: { type: LessonType; state?: LessonState; className?: string }) {
  return (
    <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-control", TILE[state], className)}>
      <TypeGlyph type={type} />
      <span className="sr-only">{lessonTypeLabel(type)}</span>
    </span>
  );
}

/** Trailing mark: this lesson is finished. */
export function CheckMark({ className }: { className?: string }) {
  return (
    <svg {...svg} className={cx("shrink-0 text-success-fg", className)}>
      <path d="m3.25 8.5 3 3 6.5-7" />
    </svg>
  );
}

/** Trailing mark: earlier lessons gate this one. */
export function LockMark({ className }: { className?: string }) {
  return (
    <svg {...svg} className={cx("shrink-0 text-muted", className)}>
      <rect x="3.25" y="7" width="9.5" height="6.75" rx="1.75" />
      <path d="M5.75 7V5.5a2.25 2.25 0 0 1 4.5 0V7" />
    </svg>
  );
}

/** Disclosure chevron. Points down closed, up open — no RTL flip needed, unlike a right-chevron. */
export function Chevron({ className }: { className?: string }) {
  return (
    <svg {...svg} className={cx("chev shrink-0", className)}>
      <path d="m4 6.25 4 4 4-4" />
    </svg>
  );
}
