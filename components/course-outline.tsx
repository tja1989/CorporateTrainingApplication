import Link from "next/link";
import { Chip, cx } from "@/components/ui";
import { CheckMark, Chevron, LessonIcon, LockMark } from "@/components/lesson-icon";
import type { CourseOutlineView, OutlineLesson, OutlineModule } from "@/lib/lms/outline";

/**
 * The course outline — modules as collapsible sections, lessons as rows
 * (spec §11.4). Native <details>, so it renders and collapses without any
 * client JS and the server decides what arrives open; navigation is a
 * 100+×/day surface and does not animate (§10.5), only the chevron turns.
 *
 *   page  — the course page: full-width cards, durations, oral-check chips
 *   rail  — the lesson page on xl: 14rem, current lesson highlighted
 *   panel — the lesson page below xl: the whole outline behind one disclosure
 *
 * Keep this a server component. React re-syncs the `open` attribute on every
 * render, so wrapping it in a "use client" parent would snap every section shut
 * the moment that parent re-renders.
 */

type Variant = "page" | "rail" | "panel";

export function CourseOutline({
  view,
  variant = "page",
  className,
}: {
  view: CourseOutlineView;
  variant?: Variant;
  className?: string;
}) {
  const compact = variant === "rail";
  const sections = (
    <div className={cx("flex flex-col", compact ? "gap-1" : "gap-3")}>
      {view.modules.map((m, i) => (
        <ModuleSection key={m.id} module={m} index={i} compact={compact} />
      ))}
    </div>
  );

  if (variant !== "panel") {
    return (
      <nav aria-label="Course contents" className={className}>
        {sections}
      </nav>
    );
  }

  return (
    <details className={cx("disclosure rounded-card border border-border bg-surface", className)}>
      <summary className="touch-target flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Chevron className="text-muted" />
          <span className="font-medium">Course contents</span>
        </span>
        <span className="shrink-0 text-xs text-muted">{positionLabel(view)}</span>
      </summary>
      <div className="border-t border-border p-3">
        <nav aria-label="Course contents">{sections}</nav>
      </div>
    </details>
  );
}

function positionLabel(view: CourseOutlineView): string {
  const flat = view.modules.flatMap((m) => m.lessons);
  const idx = flat.findIndex((l) => l.id === view.currentLessonId);
  return idx >= 0 ? `Lesson ${idx + 1} of ${flat.length}` : `${view.doneCount} of ${view.total} done`;
}

/** "3/5 · 12 min", with a trailing + when some lessons in the module have no estimate. */
function moduleMeta(m: OutlineModule, compact: boolean): string {
  const count = `${m.doneCount}/${m.total}`;
  if (compact || !m.minutes) return count;
  return `${count} · ${m.minutes} min${m.minutesPartial ? "+" : ""}`;
}

function ModuleSection({ module: m, index, compact }: { module: OutlineModule; index: number; compact: boolean }) {
  return (
    <details
      open={m.open}
      className={cx("disclosure", compact ? "rounded-control" : "rounded-card border border-border bg-surface")}
    >
      <summary
        className={cx(
          "touch-target flex cursor-pointer items-center justify-between gap-2",
          compact ? "rounded-control px-2 py-2 text-xs hover:bg-surface-2" : "px-3 py-3 text-sm",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Chevron className="text-muted" />
          {compact ? null : (
            <span className="text-xs text-muted" aria-hidden>
              {index + 1}
            </span>
          )}
          <span className="min-w-0 truncate font-medium">{m.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
          <span>{moduleMeta(m, compact)}</span>
          {!compact && m.complete ? <Chip variant="success">Done</Chip> : null}
        </span>
      </summary>
      <ul className={cx("flex flex-col", compact ? "gap-1 pb-1 ps-3" : "gap-1 border-t border-border p-2")}>
        {m.lessons.map((l) => (
          <LessonRow key={l.id} lesson={l} compact={compact} />
        ))}
      </ul>
    </details>
  );
}

function LessonRow({ lesson: l, compact }: { lesson: OutlineLesson; compact: boolean }) {
  // The 2px start border is on every row, transparent unless current, so the
  // highlight can move between rows without nudging the text sideways.
  const rowClass = cx(
    "pressable touch-target flex min-w-0 flex-1 items-center gap-2 rounded-control border-s-2 px-2 py-2",
    compact ? "text-xs" : "text-sm",
    l.locked ? "border-transparent opacity-50" : "hover:bg-surface-2",
    l.current ? "border-primary bg-surface-2 font-medium" : "border-transparent",
  );
  const body = (
    <>
      <LessonIcon type={l.type} state={l.state} />
      <span className="min-w-0 flex-1 truncate">{l.title}</span>
      {!compact && l.minutes ? <span className="shrink-0 text-xs text-muted">{l.minutes} min</span> : null}
      {l.locked ? <LockMark /> : l.done ? <CheckMark /> : null}
    </>
  );

  return (
    <li className="flex min-w-0 items-center gap-2">
      {l.locked ? (
        /* A locked row is not a link at all — nothing to focus, nothing to announce as clickable. */
        <span className={rowClass} aria-disabled="true">
          {body}
          <span className="sr-only">Locked until the earlier lessons are complete</span>
        </span>
      ) : (
        <Link href={l.href} aria-current={l.current ? "page" : undefined} className={rowClass}>
          {body}
        </Link>
      )}
      {!compact && l.oral ? <OralChip lesson={l} /> : null}
    </li>
  );
}

function OralChip({ lesson: l }: { lesson: OutlineLesson }) {
  const chip = <Chip variant={l.oral!.variant}>{l.oral!.label}</Chip>;
  if (!l.oral!.href) return chip;
  return (
    <Link href={l.oral!.href} className="hit-area shrink-0" aria-label={`${l.oral!.label} for ${l.title}`}>
      {chip}
    </Link>
  );
}
