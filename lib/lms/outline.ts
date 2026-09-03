import type { LessonPayload } from "@/lib/db/schema";

/**
 * Course outline — the shape behind the collapsible module accordion on the
 * course page and the course-contents navigator on a lesson page (spec §11.4).
 *
 * Everything here is pure: the caller supplies the rows and the lookups, this
 * module decides state, durations, roll-ups and which modules open. That keeps
 * the rules unit-testable and lets one server helper feed both surfaces.
 */

export type LessonType = "VIDEO" | "TEXT" | "PDF" | "QUIZ" | "INTERVIEW";

/** Drives the row's icon treatment. `current` wins over `done` — you can revisit a finished lesson. */
export type LessonState = "done" | "current" | "locked" | "todo";

/** The oral-check chip a row may carry, pre-resolved so the component never touches the DB. */
export type OralBadge = { label: string; variant: "success" | "warning" | "ai"; href?: string };

/** One completed-or-not oral check, reduced to what the outline needs. */
export type OralResult = { state: string; outcome: "PASS" | "FAIL" | null; scorePct: number | null };

export type OutlineLesson = {
  id: string;
  title: string;
  type: LessonType;
  href: string;
  done: boolean;
  locked: boolean;
  current: boolean;
  state: LessonState;
  /** Estimated minutes, or null when nothing is stored for this lesson type. */
  minutes: number | null;
  oral: OralBadge | null;
};

export type OutlineModule = {
  id: string;
  title: string;
  lessons: OutlineLesson[];
  doneCount: number;
  total: number;
  /** Sum of the lessons we can estimate; null when none of them can be estimated. */
  minutes: number | null;
  /** True when at least one lesson in this module has no estimate — render "12 min+". */
  minutesPartial: boolean;
  complete: boolean;
  open: boolean;
};

export type CourseOutlineView = {
  courseId: string;
  modules: OutlineModule[];
  doneCount: number;
  total: number;
  pct: number;
  minutesLeft: number | null;
  minutesLeftPartial: boolean;
  nextLessonId: string | null;
  currentLessonId: string | null;
  sequentialLock: boolean;
};

export type OutlineInputModule = { id: string; title: string; sort: number };
export type OutlineInputLesson = {
  id: string;
  moduleId: string;
  type: LessonType;
  title: string;
  sort: number;
  payload: LessonPayload;
};

export type DecorateInput = {
  courseId: string;
  modules: OutlineInputModule[];
  lessons: OutlineInputLesson[];
  doneLessonIds: Iterable<string>;
  sequentialLock: boolean;
  /** Set on a lesson page; highlights the row and opens only its module. */
  currentLessonId?: string | null;
  /** `?outline=all` — open every module regardless of the default rule. */
  expandAll?: boolean;
  /** videos.id → durationSec */
  videoSec?: Map<string, number | null>;
  /** quizzes.id → settings.timeLimitSec */
  quizSec?: Map<string, number | null>;
  /** lessonId → latest oral check */
  oral?: Map<string, OralResult>;
};

/** Average adult reading speed for workplace prose; used for TEXT lessons only. */
export const READING_WPM = 200;

/** Reading time for a markdown body, or null when there is nothing to read. */
export function readingMinutes(body: string | null | undefined): number | null {
  if (!body) return null;
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return null;
  return Math.max(1, Math.round(words / READING_WPM));
}

/**
 * Estimated minutes for one lesson. PDF returns null — nothing about a PDF's
 * length is stored, and inventing a number would make module totals lie.
 */
export function lessonMinutes(
  lesson: { type: LessonType; payload: LessonPayload },
  ctx: { videoSec?: number | null; quizSec?: number | null } = {},
): number | null {
  switch (lesson.type) {
    case "VIDEO":
      return ctx.videoSec && ctx.videoSec > 0 ? Math.max(1, Math.round(ctx.videoSec / 60)) : null;
    case "TEXT":
      return readingMinutes(lesson.payload.body);
    case "QUIZ":
      return ctx.quizSec && ctx.quizSec > 0 ? Math.max(1, Math.round(ctx.quizSec / 60)) : null;
    case "INTERVIEW": {
      const max = lesson.payload.interview?.maxMinutes;
      return max && max > 0 ? max : null;
    }
    default:
      return null;
  }
}

/** Sum what we know and flag what we don't, so a total is never silently short. */
export function sumMinutes(values: Array<number | null>): { minutes: number | null; partial: boolean } {
  const known = values.filter((v): v is number => v !== null);
  return { minutes: known.length ? known.reduce((a, b) => a + b, 0) : null, partial: known.length < values.length };
}

/** The chip shown beside a row: an oral check the learner can take, or the result of one. */
export function oralBadge(type: LessonType, done: boolean, result: OralResult | undefined, lessonId: string): OralBadge | null {
  const finished = result?.state === "COMPLETED";
  if (type === "INTERVIEW") {
    if (!finished) return null;
    return result!.outcome === "PASS"
      ? { label: `Passed · ${result!.scorePct}%`, variant: "success" }
      : { label: `Not passed · ${result!.scorePct}%`, variant: "warning" };
  }
  // A finished video or article can be checked out loud (spec §11.17 entry points).
  if (!done || (type !== "VIDEO" && type !== "TEXT")) return null;
  const href = `/lesson/${lessonId}/interview`;
  if (!finished) return { label: "Oral check", variant: "ai", href };
  return result!.outcome === "PASS"
    ? { label: `Oral check · ${result!.scorePct}%`, variant: "success", href }
    : { label: `Oral check · not passed (${result!.scorePct}%)`, variant: "warning", href };
}

/** Build the whole view: ordering, lock states, durations, roll-ups and open-by-default. */
export function decorateOutline(input: DecorateInput): CourseOutlineView {
  const done = new Set(input.doneLessonIds);
  const modules = [...input.modules].sort((a, b) => a.sort - b.sort);
  const byModule = new Map(modules.map((m) => [m.id, [] as OutlineInputLesson[]]));
  for (const lesson of input.lessons) byModule.get(lesson.moduleId)?.push(lesson);
  for (const list of byModule.values()) list.sort((a, b) => a.sort - b.sort);

  // One flat sequence across modules — this is what the course-level lock walks.
  const flat = modules.flatMap((m) => byModule.get(m.id) ?? []);
  let previousAllDone = true;
  const lockedIds = new Set<string>();
  for (const lesson of flat) {
    if (input.sequentialLock && !previousAllDone) lockedIds.add(lesson.id);
    previousAllDone = previousAllDone && done.has(lesson.id);
  }
  const nextLessonId = flat.find((l) => !done.has(l.id))?.id ?? null;
  const currentLessonId = input.currentLessonId ?? null;

  const out: OutlineModule[] = modules.map((m) => {
    const lessons: OutlineLesson[] = (byModule.get(m.id) ?? []).map((l) => {
      const isDone = done.has(l.id);
      const locked = lockedIds.has(l.id);
      const current = l.id === currentLessonId;
      return {
        id: l.id,
        title: l.title,
        type: l.type,
        href: `/lesson/${l.id}`,
        done: isDone,
        locked,
        current,
        state: locked ? "locked" : current ? "current" : isDone ? "done" : "todo",
        minutes: lessonMinutes(l, {
          videoSec: l.payload.videoId ? input.videoSec?.get(l.payload.videoId) : null,
          quizSec: l.payload.quizId ? input.quizSec?.get(l.payload.quizId) : null,
        }),
        oral: oralBadge(l.type, isDone, input.oral?.get(l.id), l.id),
      };
    });
    const roll = sumMinutes(lessons.map((l) => l.minutes));
    const doneCount = lessons.filter((l) => l.done).length;
    return {
      id: m.id,
      title: m.title,
      lessons,
      doneCount,
      total: lessons.length,
      minutes: roll.minutes,
      minutesPartial: roll.partial,
      complete: lessons.length > 0 && doneCount === lessons.length,
      open: false, // decided below, once we know the shape of the whole course
    };
  });

  applyOpenState(out, { expandAll: input.expandAll, currentLessonId });

  const allLessons = out.flatMap((m) => m.lessons);
  const doneCount = allLessons.filter((l) => l.done).length;
  const left = sumMinutes(allLessons.filter((l) => !l.done).map((l) => l.minutes));

  return {
    courseId: input.courseId,
    modules: out,
    doneCount,
    total: allLessons.length,
    pct: allLessons.length === 0 ? 0 : Math.round((doneCount / allLessons.length) * 100),
    minutesLeft: left.minutes,
    minutesLeftPartial: left.partial,
    nextLessonId,
    currentLessonId,
    sequentialLock: input.sequentialLock,
  };
}

/**
 * Which modules arrive open. On a lesson page only the module you are in — the
 * rail stays short enough to sit in view without an inner scrollbar. On the
 * course page everything still to do, so finished work folds itself away.
 */
export function applyOpenState(
  modules: OutlineModule[],
  opts: { expandAll?: boolean; currentLessonId?: string | null },
): void {
  if (opts.expandAll) {
    for (const m of modules) m.open = true;
    return;
  }
  if (opts.currentLessonId) {
    for (const m of modules) m.open = m.lessons.some((l) => l.id === opts.currentLessonId);
    return;
  }
  for (const m of modules) m.open = !m.complete;
  // A finished course would collapse to a wall of bars; leave the first section open.
  if (modules.length > 0 && modules.every((m) => !m.open)) modules[0].open = true;
}

/** Lessons in the order a learner walks them, across module boundaries. */
export function flatLessons(view: CourseOutlineView): OutlineLesson[] {
  return view.modules.flatMap((m) => m.lessons);
}

/**
 * The prev/next pair for a lesson footer. `next.locked` matters: under a
 * sequential lock the following lesson is often gated, and linking to it lands
 * the learner on the "complete the previous lessons first" screen.
 */
export function lessonNeighbours(
  view: CourseOutlineView,
  lessonId: string,
): { index: number; total: number; prev: OutlineLesson | null; next: OutlineLesson | null } {
  const flat = flatLessons(view);
  const index = flat.findIndex((l) => l.id === lessonId);
  if (index < 0) return { index: -1, total: flat.length, prev: null, next: null };
  return {
    index,
    total: flat.length,
    prev: index > 0 ? flat[index - 1] : null,
    next: index < flat.length - 1 ? flat[index + 1] : null,
  };
}
