# welearn design contract

This replaces MVP_SPEC sections10-11 where visual prescriptions conflict. User-approved on2026-09-26. Surface modes: Operate for application/workspaces; Read within text/PDF/policy lessons. The audience learns during retail work on phones/shared devices under ordinary bright ambient light, so the default is a clear light interface; retain a complete dark theme.

## Visual authority

Coursera discovery and course-detail hierarchy; LinkedIn Learning's focused player and curriculum navigation. Familiar professional learning patterns, LuLu retained only as customer identity. Product name **welearn**.

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

`CourseCover` accepts existing `coverUrl`, `title`, `tags`, optional `alt` and `priority`; it reserves a 16:9 region and falls back on load error. Adjacent title copies use decorative image alt by default. `Field` associates label and hint with its child control. `Dialog` uses the native modal element and accepts `returnFocusRef` when an explicit opener must receive focus after dismissal. Existing `Tile`, `ProgressRing`, `AnimatedNumber`, `Stagger` and button exports remain compatible; counts and page lists render immediately.

Spacing tokens: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 and 96px. System stack supports platform UI fonts plus Arabic, Devanagari and Malayalam fallbacks without a network-font dependency. Existing `ll_theme`, `ll_lang`, session and data identifiers remain compatible; retired `ll_nav` preferences are harmless and no longer control layout.

Tabs accept an optional `panelId` per tab so page owners can associate each control with its corresponding `role="tabpanel"`; arrow navigation wraps and follows the rendered LTR/RTL direction.
