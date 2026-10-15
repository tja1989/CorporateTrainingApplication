# xprtn design contract

This replaces MVP_SPEC sections10-11 where visual prescriptions conflict. User-approved on2026-09-26. Surface modes: Operate for application/workspaces; Read within text/PDF/policy lessons. The audience learns during retail work on phones/shared devices under ordinary bright ambient light, so the default is a clear light interface; retain a complete dark theme.

## Visual authority

Coursera discovery and course-detail hierarchy; LinkedIn Learning's focused player and curriculum navigation. Familiar professional learning patterns with organization-neutral product copy. Product name **xprtn**.

## Tokens

White surface, #F7F9FC background, #172B4D foreground, #526477 secondary text, #1559C9 primary/link. Validate AA pairs; dark equivalents by semantic role. Body16px and support14px. System UI sans with existing script fallback fonts; headings28-32px desktop/24px mobile. Control8px/card12px radius, pills only tags/statuses. Restrained border and shadow, no glow. Existing spacing scale may expand deliberately to support useful layout; declare tokens and verify rendered values. Motion150-250ms for feedback only, no page load choreography. Respect reduced motion.

## Layout

Learner top header/search/nav; mobile five tabs. Manager/admin persistent labeled sidebar with mobile drawer. Lesson-specific compact header, content/player and320px course outline at>=1200px; drawer under1200px; Overview/Transcript/Tutor below content. Desktop max content width1280px except lesson workspace;16px phone gutters,24px tablet,32px desktop. No hover-only navigation and no reserved empty collapsed-rail gutter. Scroll panels allowed where the workflow needs them; don't globally ban internal scrolling.

## Components and states

Clear primary/secondary/tertiary buttons, consistent inputs/selects, accessible tabs/accordions/dialogs/drawers, course imagery/cards, status badges, linear progress, readable tables/mobile rows, skeleton/empty/error states. Keep behavioral component exports compatible where possible. Every interactive element has loading/disabled/focus/error feedback. Forms retain input on error. Course covers use existing field and coherent subject fallback, no invented proof.

## Coverage

All37 page routes/auth/system states, both themes, all roles. docs/WELEARN_REWORK_PLAN.md holds exact screen behavior, interfaces, qualification matrix and release gates.


## Implemented shared interfaces

`components/shell.tsx` retains server session, notification and role-switch actions. `lib/navigation.ts` owns destinations and segment-safe current-route selection. LearnerFrame suppresses full navigation for lesson routes. `.content-container` caps ordinary pages at 1280px; `.lesson-workspace` and `.lesson-contents-panel` establish the 1200px / 320px lesson split. `.lesson-shell-main` remains available for focused lesson pages.

LearnerShell derives its header and account-action workspace from the learner route context, including direct profile links from manager/admin sessions. Role authorization and session changes remain server-controlled; the displayed learner account action returns to the user's permitted workspace.

`CourseCover` accepts existing `coverUrl`, `title`, `tags`, optional `alt` and `priority`; it reserves a 16:9 region and falls back on load error. Adjacent title copies use decorative image alt by default. `Field` associates label and hint with its child control. `Dialog` uses the native modal element and accepts `returnFocusRef` when an explicit opener must receive focus after dismissal. Existing `Tile`, `ProgressRing`, `AnimatedNumber`, `Stagger` and button exports remain compatible; counts and page lists render immediately.

Spacing tokens: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 and 96px. System stack supports platform UI fonts plus Arabic, Devanagari and Malayalam fallbacks without a network-font dependency; the Latin display face is self-hosted (see below). Existing `ll_theme`, `ll_lang`, session and data identifiers remain compatible; retired `ll_nav` preferences are harmless and no longer control layout.

Tabs accept an optional `panelId` per tab so page owners can associate each control with its corresponding `role="tabpanel"`; arrow navigation wraps and follows the rendered LTR/RTL direction.

## Visual system (UI refinement Phase 2–3, 15 October 2026)

Supersedes the token line above where they differ. Source: [the UI refinement design](docs/superpowers/specs/2026-10-15-ui-refinement-design.md).

**Type.** Headings, `.display` and the type roles use **Instrument Sans** (variable, 400–700), self-hosted from `@fontsource-variable/instrument-sans` through `next/font/local`, so no request leaves the site. Body text stays on the system stack; non-Latin scripts fall back to it in headings too. Roles: `.type-display` (sign-in and greeting, 34–48px), `.type-title` (page titles, 26–34px), `.type-section` (21px), `.type-number` (tabular figures for tiles and counts). `PageHeader` and `SectionTitle` use these roles.

**Colour roles.** Ink for the brand (`.brand` uses the foreground colour, not blue). Blue `--primary` is for actions and links only. Violet `--ai` / `--ai-fg` / `--ai-tint` marks AI help (Tutor, HR assistant); `--ai-fg` on the background is an enforced AA pair. Warning and destructive colours appear only where a figure needs attention (zero stays neutral).

**Navigation.** The current page is shown with a neutral `surface-2` fill and a thin primary indicator bar, the same in the header, the workspace sidebar and the mobile tabs.

**Elevation and feedback.** Two shadows: `--shadow-resting` (cards at rest) and `--shadow-raised` (hover on `.card-interactive`, dialogs). Pressable controls scale to 0.98 while pressed. Dialogs fade in with `@starting-style`. All motion is off under reduced motion.

**Covers.** `courseArt(title, tags)` picks a subject (food, service, safety, fire, cash or general learning) and one of six field colours (`--cover-1` … `--cover-6`, with dark-theme values). Each known subject has a fixed colour, so a course keeps its cover across renders. `CourseCover` draws the field and a simple line illustration when no cover URL is set. `.course-cover-fill` fills its box (hero, sign-in collage); `.course-cover-compact` is the small list thumbnail.

**Brand.** `Logomark` is the x mark on a navy tile; `Brand` pairs it with "xprtn". The same mark serves the favicon (`app/icon.svg`), Apple touch icon, Open Graph image and web manifest.

**Shared pieces.** `buttonClass(variant)` styles links as buttons; `Card` takes `interactive`; `Progress` is the one linear progress bar (role progressbar, value clamped 0–100); `WorkspaceTabs` is the one tab strip for view switches. The approval stepper (Draft → Department review → HR publishes → Live) comes from `workflowSteps()`.
