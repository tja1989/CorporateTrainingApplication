# xprtn UI refinement design

Source audit: https://claude.ai/artifact/N4pKRwTSpCPWKqXxgPTvYK (14 October, refreshed 15 October to cover the five-role, feedback and course-planning work merged at `f3ee763`).

## Goal

Make xprtn look and feel premium and refined for the client without changing any workflow, permission, route or data contract. The audit found six causes: no visual voice, placeholder course art, identical bordered boxes, system-speak, competing controls and missing finish. The new role workspaces repeat all six and add three of their own: empty overview pages that duplicate their sidebar, author-facing process jargon, and settings forms that expose raw formats (URLs, language codes, folder paths, time zones).

## Contract that does not change

- DESIGN.md and PRODUCT.md remain authoritative: light white/blue Operate UI with a complete dark theme, WCAG 2.2 AA, 44px targets, logical-direction layouts, multilingual fallback fonts, motion 150–250ms for feedback only and `prefers-reduced-motion` respected.
- Offline, demo and fictional-data states stay visibly labeled. The labels are rewritten in plain language, never removed.
- Consent screens keep naming the processor that receives microphone audio. Developer configuration (keys, model names, session tokens) leaves learner screens.
- Scheduling semantics stay in `Asia/Dubai` (`lib/time.ts DEFAULT_TZ`). Only the presentation of dates changes.
- No new runtime dependency and no network font. Server/client boundaries, exported component names and form field names stay compatible so existing tests and e2e selectors keep passing.

## Phase 1: Clean up (no client decision needed)

1. **One formatting module** (`lib/format.ts`): calendar dates ("Fri 17 Oct", year added when it differs), date-times, due phrases ("Due Fri 17 Oct, in 3 days", "Overdue by 2 days", "Due today"), relative time ("2 h ago"), plurals through `Intl.PluralRules`, language names through `Intl.DisplayNames`, tag labels ("fresh-food" → "Fresh food") and a friendly zone name ("Dubai time") for author forms. It replaces the 14 `toISOString().slice` display sites, the seven inline `Intl.DateTimeFormat` sites and the `toLocaleString` in `course-workflow.tsx`. Employee pages stop printing `Asia/Dubai`.
2. **One status vocabulary** (`lib/status.ts` + `StatusChip`): compliance, enrollment, publication/approval and video states map to sentence-case labels and one of five tones. `DataTable` renders known status cells through it, so no report shows `ON_TRACK`, `OVERDUE` or `published` raw. "legacy published" and "Existing published course" become "Published before approvals".
3. **Honest, plain labels**: the full-width DEMO strip becomes a compact neutral "Demo data" badge in the shell (still on every page in DEMO_MODE). Offline AI labels read "Demo answer. Live AI is off." Voice consent keeps its processor sentence and replaces "no Gemini key is configured" with "Demo mode: type your answers. Grading works the same way." Live controls show "Demo" or "Live" instead of a model id, and "Session ends in N min" instead of "session token". The reports planner label "· offline planner" becomes a "Demo" chip. Lesson types use the existing `lessonTypeLabel`.
4. **Correct plurals** everywhere a count meets a noun ("1 assignment", "3 days", "1 attempt left", "2 questions").
5. **Layout bugs**: path-course cover fills its row; instructor/department course-list thumbnails show the whole cover; the profile achievements disclosure gets the shared chevron; the oral-check intro and progress cards share one width; Upcoming shows "No upcoming training" when no filter is applied; report result summaries collapse to one line.
6. **One primary action per view and tidy sidebars**: lesson footer, quiz intro, overview shortcut rows, catalog Apply, the feedback page's second Save and editor actions keep a single solid button. The admin sidebar's split "Oversight" group is rejoined, each role's items get distinct icons, and labels match page titles ("Team", "People").
7. **Workflow and feedback jargon**: "Revision N" becomes "Version N", "Super Admin intervention" becomes "Override as Super Admin", "audited moderation decision" becomes "HR has left this response out of rating summaries", "permitted training scope", "historical instructor", "Delivered instructor", "ingestion" and "questions served" get plain wording. The feedback privacy paragraph is left for the client to review.
8. **Hygiene**: delete the 29 dead `animate-*` usages and their CSS stub, remove the undefined `.nudge` class, and add `system-ui` and `Roboto` ahead of `Arial` in `--font-sans` so Android stops falling back to Arial.

## Phase 2: Refine the system (within the contract)

Planned as a separate implementation plan once Phase 1 lands, so each plan ships on its own.

- Type roles (display, page title, section, body, support, label, number) with 16px body as DESIGN.md already requires; tabular numerals on every figure.
- Colour roles: `#1559C9` stays the action and link colour; the wordmark and headings move to the ink foreground; AI surfaces get their own hue; the active nav item becomes a neutral emphasis. DESIGN.md and `tests/design-guardrails.test.ts` are updated in the same change.
- Elevation: sections sit on the page; cards only for things you open or act on; clickable cards get a resting shadow and hover lift; `:active` press feedback; dialog fade.
- One tab, table, progress and button system; `WorkspaceLink` renders the secondary button; toolbar filters (search, Filters button, removable chips) on My Learning, team and reports.
- Role overviews (Department, Instructor, HR, Super Admin) show real summaries (waiting decisions, drafts, rollout and completion figures) instead of repeating sidebar links and the approvals list. `/department` and `/department/approvals` stop being the same page, the two Department report pages merge, and HR employee pages keep their sidebar highlight.
- Course editor header: one status, the approval workflow in a side panel, and one action menu per lesson instead of four disclosure links.
- Feedback reports: filters first, shared stat tiles, one bar component, the shared table, and moderation in a dialog.
- One folder view on My Learning (breadcrumb with folder icons, no duplicate Folder select) and date-badge cards for Upcoming.
- Training rollout: an audience segmented control and a searchable person picker instead of one select listing every employee.
- Tabs: the four current styles (sliding Tabs, WorkspaceTabs, ButtonAnchor tabs on My Learning, PillLink tabs on feedback reports) become one.
- Approval workflow as a three-step stepper (Instructor submits, Department Head decides, HR publishes) with the current step highlighted and decision history as a timeline.
- Course settings: language select, folder picker built from existing folders, live cover preview, and a single "Published. Revise to make changes." banner instead of a fully greyed form.
- Feedback: star input with visible selected state and keyboard support; reports show an empty state instead of five empty bars and a "No responses" headline.
- Generated per-course covers (own colour field and subject illustration from the course id) as the interim fallback.
- Manager/Department team table: 56px rows, initials, a "Send reminder" action, and emphasis only on figures that need attention.

## Phase 3: Signature (blocked on client decisions)

Display typeface for headings and the wordmark (bundled, no network dependency), logomark with favicon/app icon/share image, a commissioned course-cover set, a branded video poster, and a refined home hero and sign-in page. The three decisions are listed in the audit.

## Verification

Each phase runs the unit suite, type check and production build, then a screenshot pass of the affected routes at 1440px and 390px in light and dark on the local preview. Phase 1 adds unit tests for every formatter, plural and status mapping, plus a source guard that fails on new `toISOString().slice` display sites and raw status rendering.
