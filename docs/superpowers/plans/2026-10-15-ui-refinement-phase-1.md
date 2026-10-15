# UI Refinement Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the system-speak, inconsistent data formats, competing actions and small layout bugs from every role's screens, so the product reads as finished before the visual-system work in Phase 2.

**Architecture:** Add two pure modules, `lib/format.ts` (dates, plurals, language/tag/zone names) and `lib/status.ts` (status vocabulary), plus a `StatusChip` primitive. Route every display site through them, then apply targeted copy, navigation, action-hierarchy and layout fixes. No data, permission, route or workflow behavior changes.

**Tech Stack:** Existing Next.js 15, React 19, TypeScript, Tailwind v4, Vitest and Playwright; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-15-ui-refinement-design.md` (Phase 1). Audit: https://claude.ai/artifact/N4pKRwTSpCPWKqXxgPTvYK

## Global Constraints

- Scheduling semantics stay in `Asia/Dubai` via `lib/time.ts` `DEFAULT_TZ`; only presentation changes. Date inputs keep their `YYYY-MM-DD` values.
- Offline, demo and fictional-data states stay visibly labeled (PRODUCT.md). Reword, never remove.
- Voice consent keeps naming Google as the processor of microphone audio. The privacy notice and the learner feedback privacy paragraph are not rewritten in this phase.
- WCAG 2.2 AA contrast, 44px targets, visible focus and logical-direction layout stay intact. Copy is sentence case.
- Exported component names, props, form field names, routes and accessible names that e2e tests click (`Mark complete`, `Next lesson`, `Open assessment`, `Start assessment`, `Export CSV`, `Previous page`, `Next page`) stay the same.
- `tests/design-guardrails.test.ts` keeps passing; this phase changes no colour, radius or spacing token.
- No new dependency, deployment, CI bypass or data migration.

## Review Focus

1. A due time late on a Dubai evening (for example 23:30 Dubai = 19:30 UTC) must show the Dubai calendar day and "Due today", even on a UTC server. Task 1 tests it.
2. A status value added later (for example `ON_HOLD`) must render as "On hold" in a neutral chip, not as raw capitals or a crash. Task 2 tests it.
3. A date in another calendar year must show the year ("Fri 1 Jan 2027"). The current year omits it. Task 1 tests both.
4. An empty or unknown language code (`""`, `"xx"`) must not throw from `Intl.DisplayNames`; it shows the code in capitals or "Not set". Task 1 tests it.
5. Zero and overdue counts read naturally: "0 attempts left", "Overdue by 1 day", "1 result". Tasks 1 and 4 test them, and Task 4 updates the e2e assertions that pin the old wording.

---

### Task 1: Formatting module

**Files:** Create `lib/format.ts`, `tests/format.test.ts`.

**Interfaces:**
- Consumes: `DEFAULT_TZ`, `localDate(at, tz)` from `lib/time.ts`.
- Produces: `formatDay(date: Date, opts?: {tz?: string; now?: Date}): string`, `formatDateTime(date: Date, opts?): string`, `formatDue(due: Date, opts?): string`, `formatRelative(date: Date, opts?: {now?: Date; tz?: string}): string`, `calendarDaysBetween(from: Date, to: Date, tz?: string): number`, `plural(count: number, one: string, other?: string): string`, `noun(count: number, one: string, other?: string): string`, `languageName(code: string | null | undefined): string`, `tagLabel(tag: string): string`, `zoneLabel(tz?: string): string`.

- [ ] **Step 1: Write the failing tests** in `tests/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calendarDaysBetween, formatDateTime, formatDay, formatDue, formatRelative, languageName, noun, plural, tagLabel, zoneLabel } from "../lib/format";

const now = new Date("2026-10-14T06:00:00Z"); // Wed 14 Oct, 10:00 Dubai

describe("dates", () => {
  it("formats calendar days in Dubai time and adds the year only when it differs", () => {
    expect(formatDay(new Date("2026-10-17T05:30:00Z"), { now })).toBe("Sat 17 Oct");
    expect(formatDay(new Date("2027-01-01T05:30:00Z"), { now })).toBe("Fri 1 Jan 2027");
    expect(formatDay(new Date("2026-10-17T20:30:00Z"), { now })).toBe("Sun 18 Oct"); // 00:30 Dubai next day
  });
  it("formats date-times on a 24-hour clock", () => {
    expect(formatDateTime(new Date("2026-10-17T05:30:00Z"), { now })).toBe("Sat 17 Oct, 09:30");
  });
  it("counts calendar days in Dubai, not elapsed 24h blocks", () => {
    expect(calendarDaysBetween(new Date("2026-10-17T19:30:00Z"), new Date("2026-10-17T19:59:59Z"))).toBe(0);
    expect(calendarDaysBetween(new Date("2026-10-17T19:30:00Z"), new Date("2026-10-17T20:30:00Z"))).toBe(1);
  });
  it("phrases due dates", () => {
    expect(formatDue(new Date("2026-10-14T19:59:59Z"), { now })).toBe("Due today");
    expect(formatDue(new Date("2026-10-15T12:00:00Z"), { now })).toBe("Due tomorrow");
    expect(formatDue(new Date("2026-10-17T19:59:59Z"), { now })).toBe("Due Sat 17 Oct, in 3 days");
    expect(formatDue(new Date("2026-10-13T12:00:00Z"), { now })).toBe("Overdue by 1 day");
    expect(formatDue(new Date("2026-10-09T12:00:00Z"), { now })).toBe("Overdue by 5 days");
    expect(formatDue(new Date("2026-10-17T19:30:00Z"), { now: new Date("2026-10-17T19:30:00Z") })).toBe("Due today"); // 23:30 Dubai
  });
  it("phrases relative times", () => {
    expect(formatRelative(new Date(now.getTime() - 20_000), { now })).toBe("Just now");
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000), { now })).toBe("5 min ago");
    expect(formatRelative(new Date(now.getTime() - 2 * 3_600_000), { now })).toBe("2 h ago");
    expect(formatRelative(new Date("2026-10-13T06:00:00Z"), { now })).toBe("Yesterday");
    expect(formatRelative(new Date("2026-10-09T06:00:00Z"), { now })).toBe("Fri 9 Oct");
  });
});

describe("words", () => {
  it("pluralizes counts and nouns", () => {
    expect(plural(1, "assignment")).toBe("1 assignment");
    expect(plural(0, "attempt")).toBe("0 attempts");
    expect(plural(2, "person", "people")).toBe("2 people");
    expect(noun(1, "course")).toBe("course");
    expect(noun(4, "course")).toBe("courses");
  });
  it("names languages without throwing", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("ml")).toBe("Malayalam");
    expect(languageName("xx")).toBe("XX");
    expect(languageName("")).toBe("Not set");
    expect(languageName(null)).toBe("Not set");
  });
  it("humanizes tags and zones", () => {
    expect(tagLabel("fresh-food")).toBe("Fresh food");
    expect(tagLabel("POS")).toBe("POS");
    expect(zoneLabel("Asia/Dubai")).toBe("Dubai time");
    expect(zoneLabel("America/New_York")).toBe("New York time");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/format.test.ts` → FAIL, cannot resolve `../lib/format`.

- [ ] **Step 3: Implement `lib/format.ts`:**

```ts
/** Display formatting. Scheduling stays in lib/time.ts; this file only words values for people. */
import { DEFAULT_TZ, localDate } from "./time";

type DateOpts = { tz?: string; now?: Date };
const DAY_MS = 86_400_000;
const pluralRules = new Intl.PluralRules("en");

function dayNumber(date: Date, tz: string): number {
  const [y, m, d] = localDate(date, tz).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function calendarDaysBetween(from: Date, to: Date, tz: string = DEFAULT_TZ): number {
  return dayNumber(to, tz) - dayNumber(from, tz);
}

function parts(date: Date, tz: string, withTime: boolean) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  });
  return Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
}

export function formatDay(date: Date, { tz = DEFAULT_TZ, now = new Date() }: DateOpts = {}): string {
  const p = parts(date, tz, false);
  const sameYear = localDate(date, tz).slice(0, 4) === localDate(now, tz).slice(0, 4);
  return `${p.weekday} ${p.day} ${p.month}${sameYear ? "" : ` ${p.year}`}`;
}

export function formatDateTime(date: Date, opts: DateOpts = {}): string {
  const p = parts(date, opts.tz ?? DEFAULT_TZ, true);
  return `${formatDay(date, opts)}, ${p.hour}:${p.minute}`;
}

export function formatDue(due: Date, { tz = DEFAULT_TZ, now = new Date() }: DateOpts = {}): string {
  const days = calendarDaysBetween(now, due, tz);
  if (days < 0) return `Overdue by ${plural(-days, "day")}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${formatDay(due, { tz, now })}, in ${plural(days, "day")}`;
}

export function formatRelative(date: Date, { now = new Date(), tz = DEFAULT_TZ }: DateOpts = {}): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  const days = calendarDaysBetween(date, now, tz);
  if (days === 0) return `${Math.floor(seconds / 3600)} h ago`;
  if (days === 1) return "Yesterday";
  return formatDay(date, { tz, now });
}

export function noun(count: number, one: string, other: string = `${one}s`): string {
  return pluralRules.select(count) === "one" ? one : other;
}

export function plural(count: number, one: string, other?: string): string {
  return `${count} ${noun(count, one, other)}`;
}

const languages = new Intl.DisplayNames(["en"], { type: "language" });
export function languageName(code: string | null | undefined): string {
  const value = (code ?? "").trim();
  if (!value) return "Not set";
  try {
    const name = languages.of(value);
    return name && name.toLowerCase() !== value.toLowerCase() ? name : value.toUpperCase();
  } catch {
    return value.toUpperCase();
  }
}

export function tagLabel(tag: string): string {
  const words = tag.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function zoneLabel(tz: string = DEFAULT_TZ): string {
  return `${(tz.split("/").pop() ?? tz).replaceAll("_", " ")} time`;
}
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run tests/format.test.ts` → PASS.
- [ ] **Step 5: Commit.** `git add lib/format.ts tests/format.test.ts && git commit -m "feat: add shared display formatting"`

### Task 2: Status vocabulary and StatusChip

**Files:** Create `lib/status.ts`, `tests/status.test.ts`. Modify `components/ui.tsx` (add `StatusChip`, make `complianceChip` delegate), `components/workspace-ui.tsx` (DataTable cells), `components/course-catalog.tsx:111-128`, `components/training-overview.tsx:91-103`, `components/course-editor.tsx:148,342`, `components/course-workflow.tsx:13-19,96-99,196-204`, `app/(workspace)/admin/corpus/page.tsx:59`.

**Interfaces:**
- Produces: `type StatusTone = "neutral" | "success" | "warning" | "destructive"`, `statusLabel(status: string): {label: string; tone: StatusTone}`, `isKnownStatus(value: unknown): value is string`, and `StatusChip({status, className}: {status: string; className?: string})` exported from `components/ui.tsx`.

- [ ] **Step 1: Write the failing tests** in `tests/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isKnownStatus, statusLabel } from "../lib/status";

describe("status vocabulary", () => {
  it.each([
    ["ON_TRACK", "On track", "neutral"], ["DUE_SOON", "Due soon", "warning"], ["OVERDUE", "Overdue", "destructive"],
    ["COMPLETED", "Completed", "success"], ["COMPLETED_EXPIRING", "Expiring soon", "warning"], ["EXPIRED", "Expired", "destructive"],
    ["DRAFT", "Draft", "neutral"], ["SUBMITTED", "Awaiting approval", "warning"], ["APPROVED", "Approved", "success"],
    ["REJECTED", "Changes requested", "destructive"], ["LEGACY_PUBLISHED", "Published before approvals", "neutral"],
    ["PUBLISHED", "Published", "success"], ["ARCHIVED", "Archived", "neutral"], ["READY", "Ready", "success"],
    ["FAILED", "Failed", "destructive"], ["EMBEDDING", "Processing", "neutral"], ["INACTIVE", "Inactive", "warning"],
  ])("%s reads %s", (status, label, tone) => expect(statusLabel(status)).toEqual({ label, tone }));
  it("humanizes values it does not know yet", () => {
    expect(statusLabel("ON_HOLD")).toEqual({ label: "On hold", tone: "neutral" });
    expect(isKnownStatus("ON_HOLD")).toBe(false);
  });
  it("only claims exact status strings", () => {
    expect(isKnownStatus("OVERDUE")).toBe(true);
    expect(isKnownStatus("Overdue")).toBe(false);
    expect(isKnownStatus(12)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/status.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/status.ts`:**

```ts
/** One vocabulary for every status a person can see. Colour only where attention is needed. */
export type StatusTone = "neutral" | "success" | "warning" | "destructive";
const STATUS: Record<string, [string, StatusTone]> = {
  ON_TRACK: ["On track", "neutral"], DUE_SOON: ["Due soon", "warning"], OVERDUE: ["Overdue", "destructive"],
  COMPLETED: ["Completed", "success"], COMPLETED_EXPIRING: ["Expiring soon", "warning"], EXPIRED: ["Expired", "destructive"],
  WITHDRAWN: ["Withdrawn", "neutral"], NOT_STARTED: ["Not started", "neutral"], IN_PROGRESS: ["In progress", "neutral"],
  ACTIVE: ["Active", "success"], INACTIVE: ["Inactive", "warning"], INVITED: ["Invited", "neutral"],
  DRAFT: ["Draft", "neutral"], PUBLISHED: ["Published", "success"], ARCHIVED: ["Archived", "neutral"],
  SUBMITTED: ["Awaiting approval", "warning"], APPROVED: ["Approved", "success"], REJECTED: ["Changes requested", "destructive"],
  LEGACY_PUBLISHED: ["Published before approvals", "neutral"], SUPERSEDED: ["Superseded", "neutral"], RETIRED: ["Retired", "neutral"],
  PENDING: ["Queued", "neutral"], FETCHING: ["Processing", "neutral"], CHUNKING: ["Processing", "neutral"],
  EMBEDDING: ["Processing", "neutral"], READY: ["Ready", "success"], FAILED: ["Failed", "destructive"],
};

export function isKnownStatus(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(STATUS, value);
}

export function statusLabel(status: string): { label: string; tone: StatusTone } {
  const known = STATUS[status];
  if (known) return { label: known[0], tone: known[1] };
  const words = status.toLowerCase().replaceAll("_", " ");
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: "neutral" };
}
```

- [ ] **Step 4: Add the primitive** in `components/ui.tsx` after `Chip`, and make `complianceChip` delegate so existing callers keep their signature:

```tsx
import { statusLabel } from "@/lib/status";

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const { label, tone } = statusLabel(status);
  return <Chip variant={tone} className={className}>{label}</Chip>;
}

export function complianceChip(status: string): { label: string; variant: keyof typeof chipVariants } {
  const { label, tone } = statusLabel(status || "ON_TRACK");
  return { label, variant: tone };
}
```

- [ ] **Step 5: Route raw status sites through it.**
  - `workspace-ui.tsx` DataTable cell: replace the three `includes(...)` branches with `{isKnownStatus(cell) ? <StatusChip status={cell} /> : cell}`.
  - `course-catalog.tsx`: the chip at 117-128 becomes `<StatusChip status={c.status} className="max-w-full [overflow-wrap:anywhere]" />`; the meta line at 111-114 becomes `{c.estMinutes} min, {languageName(c.language)}{c.approvalState === "LEGACY_PUBLISHED" ? "" : `, ${statusLabel(c.approvalState).label}`}{c.certificateEnabled ? ", certificate" : ""}`.
  - `training-overview.tsx:96-103`: `<StatusChip status={course.approvalState} />`.
  - `course-editor.tsx:148`: `<StatusChip status={course.status} />`; line 342: `Video {statusLabel(video.ingestionStatus).label.toLowerCase()}`.
  - `course-workflow.tsx`: `labels.LEGACY_PUBLISHED` becomes `"Published before approvals"`; the history line at 203-204 becomes `{statusLabel(event.toState).label}, {statusLabel(event.toPublication).label.toLowerCase()}` (the date part is Task 3).
  - `admin/corpus/page.tsx:59`: `<StatusChip status={doc.status} />`.
- [ ] **Step 6: Verify.** `npx vitest run tests/status.test.ts && npm run typecheck` → PASS.
- [ ] **Step 7: Commit.** `git add lib/status.ts tests/status.test.ts components app && git commit -m "feat: show statuses through one vocabulary"`

### Task 3: Dates in Dubai-friendly words everywhere

**Files:** Modify the 14 display sites, the inline `Intl` sites and the time-zone notes listed below; create `tests/display-guard.test.ts`.

**Interfaces:** Consumes Task 1 `formatDay`, `formatDateTime`, `formatDue`, `formatRelative`, `zoneLabel`.

- [ ] **Step 1: Write the failing source guard** in `tests/display-guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(__dirname, "..");
function walk(dir: string): string[] { return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "api" ? [] : walk(p)) : p.endsWith(".tsx") ? [p] : []; }); }
const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))];
const hits = (re: RegExp) => files.flatMap(f => readFileSync(f, "utf8").split("\n").map((l, i) => re.test(l) ? `${f.replace(ROOT, "")}:${i + 1}` : "").filter(Boolean));

describe("display guard", () => {
  it("shows no raw ISO dates", () => expect(hits(/toISOString\(\)\s*\.slice\(/)).toEqual([]));
  it("shows no ad-hoc date formatting", () => expect(hits(/new Intl\.DateTimeFormat|toLocaleString\(|toLocaleDateString\(/)).toEqual([]));
  it("does not print the IANA zone to people", () => expect(hits(/Asia\/Dubai|\{DEFAULT_TZ\}|\(\$\{DEFAULT_TZ\}\)/)).toEqual([]));
  it("shows no raw lower- or upper-cased enum values", () => expect(hits(/\b(type|status|language|approvalState|ingestionStatus|feedbackMode|toState|toPublication)\.to(Lower|Upper)Case\(\)/)).toEqual([]));
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/display-guard.test.ts` → FAIL, listing every site below.

- [ ] **Step 3: Replace each site** (import from `@/lib/format`):

| Site | New expression |
|---|---|
| `admin/corpus/page.tsx:55` | `effective ${formatDay(doc.effectiveDate)}` |
| `admin/tickets/[ticketId]/page.tsx:37` | `formatDateTime(m.createdAt)` |
| `admin/integrity/[attemptId]/page.tsx:38`, `admin/integrity/page.tsx:45` | `formatDateTime(attempt.startedAt)` / `formatDateTime(a.startedAt)` |
| `admin/reviews/page.tsx:139` | `r.completedAt ? formatDateTime(r.completedAt) : ""` |
| `team/[userId]/page.tsx:109` | `` ` · ${formatDue(e.dueAt)}` `` |
| `team/[userId]/page.tsx:205,228` | `formatDay(r.completedAt)` / `c.completedAt ? formatDay(c.completedAt) : ""` |
| `(learner)/home/page.tsx:171` | `formatDue(c.enrollment.dueAt)` |
| `(learner)/home/page.tsx:135` | `` `Your next course opens ${formatDay(upcoming[0].course.startsAt!)}. You can review the schedule now.` `` |
| `(learner)/course/[courseId]/page.tsx:197` | delete the raw due chip; `CoursePlanningSummary` already shows the due date |
| `(learner)/profile/page.tsx:25,27` | `formatDay(...)` for completion dates |
| `(learner)/policy/[docId]/page.tsx:35` | `` `Version ${doc.version}, effective ${formatDay(doc.effectiveDate)}` `` |
| `components/inbox-list.tsx:87` | `formatRelative(n.sentAt)` |
| `components/course-feedback-form.tsx:165-170` | `formatDateTime(new Date(saved.updatedAt))` and drop the literal `UTC` |
| `components/course-workflow.tsx:202` | `formatDateTime(event.at)` |
| `components/course-card.tsx:56-59`, `course-planning-summary.tsx:8-13` | `formatDay(course.startsAt!)` / `formatDay(date)` |
| `app/(learner)/course/[courseId]/feedback/page.tsx:65` | `` `${course?.title ?? "Completed course"}, completed ${formatDay(completedAt)}. Feedback is optional and does not change completion or certificates.` `` |
| `components/feedback-reports.tsx:112,185` | delete the `Timezone:` span; `formatDay(...)` for the date cell |
| `app/(learner)/learn/page.tsx:236-239` | `Assigned training that opens later, in start-date order.` |
| `course-planning-summary.tsx:83` | delete the zone sentence |
| `course-deadline-fields.tsx:19`, `course-planning-fields.tsx:33` | replace `Asia/Dubai` with `{zoneLabel()}` |
| `lib/lms/planning-access.ts:47` | `` `This course opens ${formatDateTime(course.startsAt!)}.` `` |
| `lib/feedback/periods.ts:45,49,63` | custom: `` `${formatDay(start, { tz })} to ${formatDay(through, { tz })}` ``; week: `` `Week of ${formatDay(start, { tz })}` ``; return `label` without the `· ${tz}` suffix |

- [ ] **Step 4: Verify.** `npx vitest run && npm run typecheck` → all PASS (including `feedback-periods`, `feedback-digests` and `design-guardrails`).
- [ ] **Step 5: Commit.** `git add -A app components lib tests/display-guard.test.ts && git commit -m "fix: word every displayed date in Dubai-friendly form"`

### Task 4: Plurals, lesson types, languages and tags

**Files:** Modify the sites below; update `e2e/assessment-cycle.e2e.ts:15,102`, `e2e/assessment-rules.e2e.ts:79,93`, `e2e/assessment.e2e.ts:24`; extend `tests/format.test.ts`.

**Interfaces:** Consumes `plural`, `noun`, `languageName`, `tagLabel` (Task 1) and `lessonTypeLabel(type)` from `components/lesson-icon.tsx`.

- [ ] **Step 1: Add a failing notification-copy test** to `tests/format.test.ts`:

```ts
import { renderNotification } from "../lib/notify";
it("words notification counts naturally", () => {
  expect(renderNotification("due_soon", { courseTitle: "Food Safety", days: 1 }).body).toBe("“Food Safety” is due in 1 day.");
  expect(renderNotification("due_soon", { courseTitle: "Food Safety", days: 3 }).body).toBe("“Food Safety” is due in 3 days.");
});
```

  `renderNotification(kind, payload)` is already exported from `lib/notify.ts:83`.

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/format.test.ts` → FAIL on "1 day(s)".

- [ ] **Step 3: Fix every count/noun pair:**

| Site | New text |
|---|---|
| `lib/notify.ts:27,28` | `${plural(p.responses, "response")}` |
| `lib/notify.ts:35,38` | `due in ${plural(p.days, "day")}` / `expires in ${plural(p.days, "day")}` |
| `lib/reports.ts:494,497,500` | `${plural(n, "enrollment")} ${n === 1 ? "is" : "are"} overdue`, `${plural(n, "certificate")} ${n === 1 ? "expires" : "expire"}`, `${plural(n, "row")} returned.` |
| `lib/lms/sweep.ts:264` | `` `${overdue} overdue and ${dueSoon} due-soon ${noun(overdue + dueSoon, "item")} on your team. ` `` |
| `lib/live/course-tools.ts:121` | `` `${plural(courses.length, "course")} assigned: ...` `` |
| `app/(learner)/drill/session.tsx:59` | `${plural(Math.min(daysThisWeek + 1, 7), "active day")} this week` |
| `app/(learner)/quiz/[quizId]/page.tsx:98` | `` `${plural(attemptsLeft, "attempt")} left` `` |
| `app/(learner)/quiz/[quizId]/runner.tsx:382` | `{plural(n, "question")} {n === 1 ? "is" : "are"} unanswered or incomplete.` with `n = served.length - answeredCount` |
| `app/(learner)/profile/page.tsx:25` | `{plural(active, "active course")} assigned.` |
| `app/(workspace)/team/page.tsx:18-25,232` | stat units become `[one, other]` pairs rendered with `noun(value, ...)`; row text `{plural(items.length, "assignment")}` |
| `components/course-catalog.tsx:92` | `{plural(courses.length, "course")}` |
| `components/course-lesson-preview.tsx:37,113` | `{plural(cfg.questionCount, "question")}, {cfg.passPct}% to pass, {plural(cfg.maxMinutes, "minute")}`; `Pass mark {quiz.settings.passPct}%, {plural(count, "question")} per attempt` (drop the raw `feedbackMode` word) |
| `components/workspace-reports.tsx:101-103` | labels `Expiring within` / `Active in the last` with a `days` suffix outside the input |

- [ ] **Step 4: Human labels for enums:** `home/page.tsx:109` and `lesson/[lessonId]/page.tsx:92` use `lessonTypeLabel(...)`; `course-editor.tsx:275` uses `lessonTypeLabel(lesson.type)`; `course/[courseId]/page.tsx:193`, `course-card.tsx:73`, `learn/page.tsx:200`, `profile/page.tsx:28` use `languageName(...)`; `course-card.tsx` tag chips use `tagLabel(tag)`.
- [ ] **Step 5: Update e2e assertions** to the new wording: `"2 attempts left"`, `"1 attempt left"`, `"0 attempts left"`, `"1 question is unanswered"`.
- [ ] **Step 6: Verify.** `npx vitest run && npm run typecheck` → PASS. Run `npx vitest run tests/display-guard.test.ts` → PASS (enum case-changes gone).
- [ ] **Step 7: Commit.** `git add -A && git commit -m "fix: pluralize counts and name lesson types, languages and tags"`

### Task 5: Plain, honest labels

**Files:** Modify `components/ui.tsx` (`DemoBanner`), `components/ai-surface.tsx:38`, `components/voice-consent.tsx:89`, `components/live-controls.tsx:98-99`, `app/(workspace)/admin/reports/ask.tsx:97`, `components/course-workflow.tsx:96-99,136-139,182-184,196-199`, `components/training-overview.tsx:92-93`, `components/feedback-moderation.tsx:31`, `components/course-feedback-form.tsx:176-184`, `components/feedback-reports.tsx:201`, `app/(learner)/course/[courseId]/feedback/page.tsx:91,102-103`, `components/course-editor.tsx` (the "Retry video ingestion" button), `e2e/learner.e2e.ts:158`.

- [ ] **Step 1: Update the e2e expectation first** (`e2e/learner.e2e.ts:158`): `await expect(page.getByText("Demo mode: type your answers. Grading works the same way.")).toBeVisible();`
- [ ] **Step 2: Rewrite the labels:**

| Site | New copy |
|---|---|
| `DemoBanner` | a compact pill: `<p className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted"><Icon name="warning" size={14} />Demo data: fictional company, people and policies</p>` |
| `ai-surface.tsx:38` | `Demo answer. Live AI is off.` |
| `voice-consent.tsx:89` | `Demo mode: type your answers. Grading works the same way.` (line 57's Google disclosure stays) |
| `live-controls.tsx:98-99` | `<Chip variant="ai">{mock ? "Demo" : "Live"}</Chip>` and `Session ends in {plural(expiresIn, "minute")}` |
| `ask.tsx:97` | `View the report and filters used` followed by `{result.mock ? <Chip>Demo</Chip> : null}` |
| `course-workflow.tsx:96-99` | `Version {course.contentRevision}. Instructor submits, Department Head decides, HR publishes.` |
| `course-workflow.tsx:138,183` | `Override as Super Admin` / `Record override` |
| `course-workflow.tsx:197-198` | `{actionLabel} version {event.revision}, by {name}` |
| `training-overview.tsx:92-93` | `Version {course.contentRevision}, {plural(course.estMinutes, "minute")}` |
| `feedback-moderation.tsx:31` | replace "Revision N" with "Version N" |
| `course-feedback-form.tsx:176-184` | `HR has left this response out of rating summaries.` |
| `feedback-reports.tsx:201` | `No responses in this period.` |
| feedback page `:91` | `Instructor: {trainer?.name ?? "Your instructor"}` |
| feedback page `:102-103` | `We don't know who taught this session, so only course feedback is available.` |
| course editor retry button | `Retry video processing` |

- [ ] **Step 3: Verify.** `npx vitest run && npm run typecheck` → PASS. `grep -rn -e "Gemini key" -e "session token" -e "offline planner" -e "intervention" -e "ingestion" app components --include='*.tsx'` returns only the Google disclosure in `voice-consent.tsx:57` and non-visible identifiers.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "fix: label demo states plainly and remove workflow jargon"`

### Task 6: Navigation and one primary action per view

**Files:** Modify `lib/navigation.ts`, `tests/nav-rail.test.ts`, `components/lesson-progress.tsx:39-45` (lesson footer), `components/training-overview.tsx` (shortcut row), `components/course-catalog.tsx` (Apply), `app/(learner)/course/[courseId]/feedback/page.tsx` + `components/course-feedback-form.tsx` (Save buttons), `components/course-editor.tsx` (Save settings beside workflow actions), `components/workspace-reports.tsx:120-160`, `e2e/workspaces.e2e.ts:133`, `e2e/reports-qualification.e2e.ts:118`.

- [ ] **Step 1: Write failing nav tests** in `tests/nav-rail.test.ts`:

```ts
import { ADMIN_NAV } from "../lib/navigation";
it("keeps each sidebar group contiguous", () => {
  const groups = ADMIN_NAV.map(i => i.group ?? "").filter((g, i, a) => g && g !== a[i - 1]);
  expect(new Set(groups).size).toBe(groups.length);
});
it("gives every item in a role's sidebar its own icon", () => {
  for (const nav of [ADMIN_NAV, HR_NAV, DEPARTMENT_NAV, INSTRUCTOR_NAV]) expect(new Set(nav.map(i => i.icon)).size).toBe(nav.length);
});
```

  Import `ADMIN_NAV, HR_NAV, DEPARTMENT_NAV, INSTRUCTOR_NAV` alongside the existing imports.
- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/nav-rail.test.ts` → FAIL (split Oversight group, repeated chart/users icons).
- [ ] **Step 3: Fix navigation:** give `/feedback` `group: "Oversight"` and place it after Reports; use distinct existing icons (Reports `chart`, Feedback reports `thumbs-up`, Department employees `users`, Training rollout `arrow-right`); rename "Department employees" to "Team" and "People & assignments" to "People" to match their page titles. Leave `MANAGER_NAV` in place; `tests/nav-rail.test.ts` still uses it. Add any missing icon to `components/icons.tsx` only if no existing one fits.
- [ ] **Step 4: One primary per view:**
  - Lesson footer (`components/lesson-progress.tsx:45`): `<ButtonLink variant={self.done ? "primary" : "secondary"} href={next.href}>Next lesson</ButtonLink>`, so `Mark complete` (or `Open assessment`) is the only primary until the lesson is done. At line 39, drop the "When you have finished, mark this lesson complete." sentence for text and PDF lessons and use `Completes automatically when you finish.` for the other types.
  - `training-overview.tsx` shortcut row: every shortcut `variant="secondary"`.
  - `course-catalog.tsx`: `Apply` becomes `variant="secondary"`; `Create a course` stays the page's one primary and the duplicate "New course" heading button is removed when the inline form is shown.
  - Feedback page: one `Save feedback` primary per form, the instructor form's button `variant="secondary"` until the course rating is saved.
  - Course editor: `Save settings` stays primary inside Settings; workflow actions in the approval panel use primary only for the actor's single next step.
  - `workspace-reports.tsx`: replace the three count lines with `<p className="text-sm text-muted">{plural(result.rows.length, "result")}</p>`; render the pagination `nav` (with its unchanged `Page {current} of {pages}` text) only when `pages > 1`; move "CSV includes all filtered results" into the Export link's `title` and an `sr-only` span.
- [ ] **Step 5: Verify.** `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "fix: tidy sidebars and keep one primary action per view"`

### Task 7: Layout fixes and hygiene

**Files:** Modify `app/globals.css`, `components/course-cover.tsx` (optional `size` prop), `app/(learner)/path/[pathId]/page.tsx:109-116`, `components/course-catalog.tsx:100-106`, `app/(learner)/profile/page.tsx:29`, `app/(learner)/lesson/[lessonId]/interview-lesson.tsx`, `app/(learner)/learn/page.tsx:255-262`, `components/tile.tsx:59`, `app/(learner)/ask-hr/chat.tsx:252`, every file using `animate-enter|animate-slide-up|animate-pop|animate-stagger|animate-float|animate-wave` (20 files), `tests/design-guardrails.test.ts`.

- [ ] **Step 1: Add failing guardrails** to `tests/design-guardrails.test.ts`:

```ts
it("prefers the platform UI font before Arial", () => {
  const stack = css.match(/--font-sans:([^;]+);/)![1];
  expect(stack.indexOf("system-ui")).toBeGreaterThan(-1);
  expect(stack.indexOf("Roboto")).toBeLessThan(stack.indexOf("Arial"));
});
it("ships no dead animation or undefined helper classes", () => {
  expect(files.filter(f => /\banimate-(enter|slide-up|pop|stagger|float|wave)\b|\bnudge\b(?!Action|edRecently)/.test(readFileSync(f, "utf8")))).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/design-guardrails.test.ts` → FAIL.
- [ ] **Step 3: Hygiene:** set `--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, "Noto Sans Arabic", "Noto Sans Devanagari", "Noto Sans Malayalam", sans-serif;`; delete the `.animate-enter…` stub rule in `globals.css:241` and the class names from the 20 files; remove `nudge` from `tile.tsx:59` and `chat.tsx:252`.
- [ ] **Step 4: Layout fixes:**
  - Cover sizes: add to `globals.css` `.course-cover-fill { aspect-ratio: auto; height: 100%; }` inside `@media (min-width: 640px)` and `.course-cover-compact .course-cover-fallback { min-height: 0; gap: 0; } .course-cover-compact .course-cover-symbol { width: 48px; height: 40px; } .course-cover-compact .course-cover-symbol svg { width: 24px; height: 24px; } .course-cover-compact .course-cover-line { display: none; }`. Path page passes `className="course-cover-fill"`; catalog thumbnail passes `className="course-cover-compact"`.
  - Profile achievements: add `disclosure` to the `<details>` class and `<Icon name="chevron-down" size={16} className="chev ms-auto" />` inside its `<summary>`.
  - Oral check: wrap the intro card and the progress card in one `max-w-3xl` column so both share a width.
  - Upcoming empty state (`learn/page.tsx`): when `query.view === "upcoming"` and no filter is set, render `EmptyState` with title `No upcoming training` and body `Training scheduled to open later will appear here.` and no Clear action; keep the existing filtered copy otherwise.
- [ ] **Step 5: Verify.** `npx vitest run && npm run typecheck && npm run build` → PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "fix: cover sizing, disclosure affordance, empty states and dead classes"`

### Task 8: Qualification

**Files:** Update `docs/qa/PROGRESS.md` with results.

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build` → PASS, recording counts.
- [ ] **Step 2:** Run the affected e2e specs against the local QA preview (`npm run test:e2e -- e2e/assessment-cycle.e2e.ts e2e/assessment-rules.e2e.ts e2e/assessment.e2e.ts e2e/learner.e2e.ts e2e/workspaces.e2e.ts e2e/reports-qualification.e2e.ts e2e/catalog-qualification.e2e.ts e2e/inbox-history.e2e.ts`) → PASS with zero retries. If the QA preview is unavailable, record that and run the screenshot pass only.
- [ ] **Step 3:** Screenshot pass of Employee, Department Head and Instructor routes at 1440px and 390px, light and dark, against the refreshed local preview; compare with the audit images and confirm: no ISO dates, no raw enums, no `Asia/Dubai`, one primary per view, path and catalog covers intact.
- [ ] **Step 4:** Commit `docs/qa/PROGRESS.md` and refresh the audit artifact's "Phase 1 status" section.
