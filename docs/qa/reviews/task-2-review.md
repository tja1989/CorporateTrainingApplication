# Task 2 independent review — ffb645c

Spec compliance: issues found. Shared tokens, branding, navigation, auth surfaces and lesson-layout hooks match Task2 scope. Task quality: Needs fixes.

## Important

Preserve a coherent workspace when opening My profile. components/account-menu.tsx:26 links directly to /profile from every workspace. The unchanged learner layout passes the existing session through (app/(learner)/layout.tsx:4), while components/shell.tsx:31 chooses header navigation from session.workspace. A manager/admin therefore receives learner content with a workspace header, no desktop learner navigation/search, and no workspace sidebar. The controller independently reproduced this for a manager. Switch workspace appropriately before entering the profile, or explicitly derive the learner shell from its route context while keeping account actions consistent. Add a browser regression covering workspace → My profile → continued navigation.

## Minor, deferred to Task3

Restore visible streaming feedback. The replacement shared styles around app/globals.css:238 remove .stream-cursor entirely, but retained consumers still render empty spans in components/live-captions.tsx:49, components/live-captions.tsx:55, app/(learner)/ask-hr/chat.tsx:204 and app/(learner)/lesson/[lessonId]/video-client.tsx:378. These indicators now have no visible dimensions or appearance, losing the distinction between provisional and finished text. Restore an understated cursor/status style with reduced-motion support, or replace those consumers with another visible streaming indicator.

## Cannot verify

Complete dark-theme compact-lesson/system-state coverage or full keyboard/RTL/zoom qualification not verifiable from supplied evidence. Controller to resolve scope and obtain missing shared-shell visual evidence. Full all-workflow keyboard/RTL/zoom is explicitly Task5; no final qualification claimed now.

## Strengths and checked evidence

Field labels/hints/errors associated; call sites inspected supply single controls. Most-specific active route and RTL tab wrap centralized. Mandatory MFA and atomic initial-secret guard close bypasses. Dialog explicit focus-return backed by WebKit regression. Local-only fixtures and real UI/persistence assertions, retries disabled.126 unit tests/typecheck/build,27 nav cases,12 recovery cases reviewed; no suite rerun and no build warnings.
