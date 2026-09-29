# Tutor formatting fix — 2026-09-29

The Tutor rendered assistant Markdown as plain text, showing literal `**` and `*` markers. Saved/final and streaming assistant replies now use the existing escaped React Markdown renderer, with a heading offset of two. User messages remain literal text; citation actions and persisted content are unchanged. This fixes the reported bold/italic defect without introducing a new Markdown parser or raw HTML rendering.

## Verification

- Regression first failed against the previous production build because the answer contained no `<strong>` element. The same test now checks bold and italic formatting both immediately after an answer and after reloading stored history.
- All 18 Tutor executions passed: three existing cases across Chromium, Firefox and WebKit, desktop and mobile. They include network recovery, persisted history, allowed citation destinations and legacy citation handling.
- Six existing layout/accessibility executions passed: light and dark themes on Chromium desktop, mobile and native 200% zoom, including the active Tutor answer, keyboard citation focus, overflow and accessibility checks.
- All 181 unit tests, TypeScript checks and the production build passed. The interface detector reported no findings. A read-only scoped code review found no actionable issues.
- In the actual Codex in-app browser, two existing answers and one newly submitted demo answer showed semantic bold text at weight 600 and italic notes after reload, with all six citation buttons retained and no horizontal overflow. Navigation and submission used keyboard activation; this does not resolve the earlier pointer automation limitation. Streaming uses the same renderer, but the focused assertions inspect settled replies rather than holding a partial stream open.

## Provenance and limits

Build `CdZx8YPkuzG9mR7sOAjGR` was created from base commit `af0ca8660b46e24d58a8e1ed8279fb3bc8c41699` plus the recorded application/test patch, SHA256 `e14b8a2914ea647398afae4a3d81db679530187ff7c29471ccd06a48837b2c0c`. Tests accurately record this as a modified checkout. Later changes to this note do not change the application build.

Evidence is retained under [`.artifacts/rich-text-20260929`](../../.artifacts/rich-text-20260929): `build-manifest.json`, `source.patch`, `red/results.json`, `green/results.json`, `quality/results.json`, `unit.log`, `typecheck.log`, `build.log`, `design-detect.json`, `in-app-result.json` and `saved-reply-fixed.png`.

The prior production build is preserved in `previous-build-NGmjXLUbonvPoG_RYpIJW` inside that directory. The preview uses its existing database and session configuration, preserving the conversation. Automated checks use the separate fictional database `welearn_richtext_20260929`.

The previous complete 741-case runs belong to the earlier build. This focused fix does not requalify the entire application, establish live AI behavior, or explain the historical WebKit first-input failure. Existing acceptance limits remain as documented in [QUALIFICATION.md](QUALIFICATION.md).
