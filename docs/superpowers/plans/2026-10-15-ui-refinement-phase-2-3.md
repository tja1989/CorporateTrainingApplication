# UI Refinement Phases 2–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give xprtn a visual voice and a consistent system — type roles, colour roles, elevation, real course art, brand assets and refined role screens — so it reads as a premium product, without changing workflows, permissions, routes or data.

**Architecture:** Foundation first (tokens, bundled display face, brand assets, cover system, shared primitives), then surfaces (learner, workspace, authoring, feedback, sign-in), then the deferred minors, docs and one qualification pass. Each task ships on its own and keeps every e2e-driven accessible name.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, Vitest 4 (oxc JSX), Playwright; one new dependency: `@fontsource-variable/instrument-sans` (OFL font files, bundled at build).

**Spec:** `docs/superpowers/specs/2026-10-15-ui-refinement-design.md` (Phase 2, Phase 3 and "Decisions applied"). Audit: https://claude.ai/artifact/N4pKRwTSpCPWKqXxgPTvYK

## Global Constraints

- WCAG 2.2 AA contrast for every text/background token pair in both themes (enforced in `tests/design-guardrails.test.ts`), 44px targets, visible focus, logical-direction layout, `prefers-reduced-motion` respected; motion 150–250ms and only in answer to an action.
- No runtime network font. Body text stays on the system stack with Noto Arabic/Devanagari/Malayalam fallbacks.
- Demo, offline and fictional-data states stay visibly labeled. Consent copy keeps naming the processor. Privacy notice and feedback privacy text do not change.
- Accessible names and labels the e2e suites drive stay identical, including: `Mark complete`, `Next lesson`, `Open assessment`, `Start assessment`, `Course overview`, `Lesson complete`, `Export CSV`, `Apply filters`, `Previous page`, `Next page`, `Search courses`, `Topic`, `Duration`, `Enrollment status`, `Sort by`, `Audience`, `Review lesson content`, `Edit lesson`, `Decision history`, rating radios `N — Word` (e.g. `5 — Excellent`), `Override as Super Admin`, `Record override`, `Retry processing`, `Watch coverage` progressbar, tab names `Overview` / `Transcript` / `Tutor`. Filter controls stay visible on desktop.
- The video player still loads with the page (e2e asserts one player creation and the resume seek); the poster is an overlay over it.
- CSV exports keep raw codes. No data migration, route change or deployment.

## Review Focus

1. Dark theme: every new token (display, AI hue, cover fields, shadows) must read correctly in dark mode; cover illustrations stay visible on dark fields. Task 1 and Task 3 tests check token pairs and both theme blocks.
2. A course with an unrecognised subject or a very long title must still get a stable, readable cover; the same course must always get the same colour. Task 3 tests it.
3. The video poster must never hide a player that is already playing after a citation or transcript seek; seeking starts playback and removes the poster. Task 5 render test covers the seek path.
4. Role overviews must keep working for a role with no department (the existing "no department" notice) and with zero items in every list. Task 6 render/guard tests cover empty data.
5. The star rating must stay operable by keyboard (native radios) and keep its accessible names. Task 8 render test asserts names and radio semantics.

---

### Task 1: Foundation tokens, type roles and the bundled display face

**Files:** `package.json`/lock (`@fontsource-variable/instrument-sans`), `app/layout.tsx`, `app/globals.css`, `components/ui.tsx` (`PageHeader`, `SectionTitle`, buttons press feedback), `components/dialog.tsx` (fade), `tests/design-guardrails.test.ts`.

**Interfaces:** CSS variables `--font-display` (Instrument Sans with the system fallback), `--shadow-resting`, `--shadow-raised`; utility classes `.type-display`, `.type-title`, `.type-section`, `.type-number`; `.brand` becomes ink (`var(--foreground)`); AI tokens move to a violet family; active navigation uses foreground text on `surface-2` with a 3px primary indicator instead of blue-on-tint.

- [ ] RED: guardrails assert the display variable is declared and used by `.display`/type roles, the new AI pairs (`ai-fg` on `surface`, `ai-fg` on `ai-tint`, `ai-fg` on `background`) pass AA in both themes, `--shadow-resting` exists, `.pressable:active` exists, and dialogs declare an opening transition under the reduced-motion guard.
- [ ] Install the font package; load `instrument-sans-latin-wght-normal.woff2` with `next/font/local` (`variable: "--font-instrument"`, `display: "swap"`) and add the class on `<html>`.
- [ ] Add type roles (display clamp 34–48px/600/−0.025em; title clamp 26–34px; section 20–22px; number tabular display face), resting/raised shadows, press feedback (`transform: scale(.98)` on `:active`, 150ms), neutral active-nav styles for header, workspace sidebar and mobile tabs, dialog fade/scale via `@starting-style`.
- [ ] `PageHeader` h1 uses `.type-title`, its `sub` becomes `text-base`; `SectionTitle` uses `.type-section`.
- [ ] GREEN: `npx vitest run tests/design-guardrails.test.ts`, full suite, `npx tsc --noEmit`. Commit `feat: add type roles, bundled display face and colour roles`.

### Task 2: Brand assets

**Files:** `components/brand.tsx`, `app/icon.svg`, `app/apple-icon.tsx`, `app/manifest.ts`, `app/opengraph-image.tsx`, `app/layout.tsx` (metadata), `tests/brand.test.ts`.

**Interfaces:** `Logomark({ size?: number; className?: string })` (decorative SVG, `aria-hidden`), `Brand` renders logomark + wordmark with the link's accessible name unchanged (`xprtn`); `manifest()` returns name `xprtn`, theme colour, icons.

- [ ] RED: render test — `Brand` markup contains an `svg` with `aria-hidden="true"` and the visible text `xprtn`; `manifest()` returns `name: "xprtn"`, `display: "standalone"` and an icon entry.
- [ ] Monogram: rounded square in ink with an "x" built from two strokes, one in action blue; same geometry in `app/icon.svg`; `apple-icon` and `opengraph-image` render it with `ImageResponse` (system fonts only).
- [ ] Metadata: title template `%s · xprtn` stays out (titles unchanged), add `description`, `applicationName`, manifest link via `app/manifest.ts`.
- [ ] GREEN and commit `feat: add xprtn logomark, icons and share image`.

### Task 3: Course cover system

**Files:** `lib/course-art.ts`, `components/course-cover.tsx`, `app/globals.css`, `tests/course-art.test.ts`.

**Interfaces:** `courseArt(title: string, tags?: string[]): { field: 1|2|3|4|5|6; subject: "safety"|"fire"|"service"|"cash"|"food"|"learning" }` (pure, stable hash); `CourseCover` keeps its props and renders the field colour (`--cover-n` tokens with dark variants) and a subject illustration SVG; compact and fill variants keep working.

- [ ] RED: `courseArt` is stable for the same input, maps "Food Safety Essentials" → food/safety subject, "Fire & Emergency" → fire, "Customer Service Basics" → service, "POS & Cash Handling" → cash, unknown → learning; a 300-character title still returns a valid field; render test: fallback has the field class and an `svg`, and no fake text lines.
- [ ] Implement six curated fields (deep teal, indigo, plum, ochre, forest, slate) with light and dark values; white line illustrations (2.5 stroke) per subject; keep `coverUrl` images first.
- [ ] GREEN and commit `feat: give every course a distinct generated cover`.

### Task 4: Shared primitives

**Files:** `components/ui.tsx`, `components/course-card.tsx` (`LearningProgress` → shared `Progress`), `components/workspace-ui.tsx` (`WorkspaceLink`, `WorkspaceTabs`), `app/(learner)/learn/page.tsx` (view switcher), `components/feedback-reports.tsx` (kind switch), `app/(learner)/lesson/[lessonId]/video-client.tsx` (watch bar), `tests/primitives.test.ts`.

**Interfaces:** `Progress({ value: number; label: string; showValue?: boolean; size?: "sm"|"md" })` with `role="progressbar"` and the given accessible name; `LearningProgress` delegates to it; `WorkspaceLink` renders the secondary button classes; `Card` gains `interactive?: boolean` (resting shadow + hover lift); one underline tab style.

- [ ] RED: render tests — `Progress` exposes `aria-valuenow` and the label; `WorkspaceLink` class list matches the secondary button; guard — learn page and feedback reports use `WorkspaceTabs`, not `ButtonAnchor`/`PillLink` tabs.
- [ ] Implement; `CourseCard` uses `interactive` cards; the watch bar keeps `aria-label="Watch coverage"`.
- [ ] GREEN and commit `refactor: one progress, tab, card and secondary-link system`.

### Task 5: Learner surfaces

**Files:** `app/(learner)/home/page.tsx`, `app/(learner)/course/[courseId]/page.tsx`, `app/(learner)/path/[pathId]/page.tsx`, `app/(learner)/learn/page.tsx`, `components/course-card.tsx`, `components/course-folders.tsx`, `components/catalog-filters.tsx`, `app/(learner)/lesson/[lessonId]/page.tsx` (footer nav, quiz intro), `app/(learner)/lesson/[lessonId]/video-client.tsx` (poster overlay), `tests/video-poster.test.ts`.

- [ ] Home: a single "Continue" hero band (large cover, course and lesson, meta, progress, one primary); "Required training" as a compact list (cover thumb, title, due phrase chip) without a surrounding box; learning paths as cards with step progress.
- [ ] Course page: larger cover, one due chip, `Progress`; path page: a connected step list with done/current/locked states.
- [ ] My Learning: upcoming cards show a prominent opening-date badge; the duplicate Folder select is removed in favour of the folder breadcrumb with folder icons; filter panel restyled lighter with every labelled control still visible on desktop.
- [ ] Lesson footer: previous/next and course overview as ghost buttons with arrow icons (names unchanged); quiz intro shows time limit, attempts and pass mark as figures.
- [ ] Video: branded poster overlay (course field colour, play button, lesson title and duration) over the already-created player; clicking play, a citation seek or a transcript jump plays the video and removes the poster. RED render test asserts the poster button exists before play and the player host stays mounted.
- [ ] GREEN and commit `feat: refine learner home, course, path, catalog and lesson surfaces`.

### Task 6: Workspace surfaces

**Files:** `components/training-overview.tsx`, `app/(workspace)/department/page.tsx`, `app/(workspace)/department/approvals/page.tsx`, `app/(workspace)/team/page.tsx`, `lib/navigation.ts`, `components/workspace-reports.tsx`, `tests/nav-rail.test.ts`, `tests/workspace-overview.test.ts`.

- [ ] Overviews show real figures through `Tile` (waiting decisions, drafts, changes requested, published, and for Department Heads team overdue/due soon) and a "Needs attention" list; the duplicate shortcut row goes; the approvals page becomes the full queue while the overview shows the top items with a "Review all" link; empty data and the no-department notice still render.
- [ ] Team dashboard: 56px rows with initials avatars, one assignment summary line, status chip, and a per-row "Send reminder" form using the existing `nudgeAction`; summary figures in the number role, colour only where attention is needed; the team page links Department Heads to `/department/reports`.
- [ ] Navigation: HR on `/team/[id]` keeps "Employees" highlighted (RED test in `nav-rail.test.ts`).
- [ ] Reports filters restyled to match the catalog toolbar.
- [ ] GREEN and commit `feat: role overviews with real figures and a calmer team table`.

### Task 7: Authoring

**Files:** `components/course-workflow.tsx`, `components/course-editor.tsx`, `components/course-planning-fields.tsx`, a small client `components/cover-preview.tsx`, `tests/workflow-stepper.test.ts`.

**Interfaces:** `workflowStep(course): { steps: { key: "draft"|"review"|"publish"|"live"; label: string; state: "done"|"current"|"upcoming" }[] }` (pure).

- [ ] RED: `workflowStep` returns the right current step for DRAFT, SUBMITTED, APPROVED (unpublished), REJECTED (back at draft with changes requested), PUBLISHED/APPROVED and LEGACY_PUBLISHED.
- [ ] Workflow panel: a four-step stepper with the current step highlighted, one status (the editor header drops its duplicate chip), decision history as a timeline inside the existing `Decision history` disclosure.
- [ ] Curriculum rows: compact rows with a lesson-type chip; links and forms keep their names.
- [ ] Settings: language becomes a select of supported languages (same field name), folder input gets a datalist of existing folders, cover URL gets a live preview, and published courses show one "Published. Revise this course to make changes." banner above the form.
- [ ] GREEN and commit `feat: approval stepper and clearer course settings`.

### Task 8: Feedback

**Files:** `components/course-feedback-form.tsx`, `components/feedback-reports.tsx`, `tests/feedback-form.test.ts`.

- [ ] RED: render test — the rating renders five native radios whose accessible names stay `1 — Poor` … `5 — Excellent`, visually drawn as stars.
- [ ] Reports: period filter first, `Tile` figures, the distribution bars only when there are responses (otherwise an empty state), tables in the shared style.
- [ ] GREEN and commit `feat: star rating and clearer feedback reports`.

### Task 9: Sign-in

**Files:** `components/auth-frame.tsx`, `app/(auth)/login/page.tsx` copy if needed.

- [ ] Desktop left column: logomark, display headline, a small collage of three generated course covers; equal heading weights; mobile unchanged in structure. No e2e-driven label changes.
- [ ] Verify and commit `feat: refined sign-in page`.

### Task 10: Remaining minors

**Files:** `components/voice-consent.tsx`, `lib/notify.ts`, `lib/feedback/reports.ts`, `lib/feedback/service.ts`, `app/(workspace)/admin/courses/actions.ts`, `components/workspace-ui.tsx`, tests.

- [ ] RED tests: HR voice consent demo line does not mention grading; `course_workflow_updated` reads "… now needs changes" / "… is now published"; no "historical instructor" or "ingestion" in user-facing lib strings (extend the display guard to `lib/**/*.ts` string literals for these words); DataTable chips only in columns whose header is a status column.
- [ ] Implement and commit `fix: clear the remaining review minors`.

### Task 11: Docs

**Files:** `DESIGN.md`, `docs/qa/PRIVACY_WORDING_PROPOSAL.md`, `docs/qa/CLIENT_DELIVERY_DECISIONS.md`, `docs/qa/PROGRESS.md`.

- [ ] DESIGN.md records the display face, colour roles, elevation and cover system; the privacy proposal shows current and proposed text side by side for sign-off; rulings appended. Commit `docs: record Phase 2–3 design system and decisions`.

### Task 12: Qualification

- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run build`.
- [ ] Screenshot pass of Employee, Department Head and Instructor at 1440px and 390px, light and dark, against a private copy of the fictional seed database; check the Review Focus items visually.
- [ ] Final whole-branch review; one fix pass for Critical/Important; merge into local main; ask before pushing.
