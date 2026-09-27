# Task4 independent review —5a64410

Spec compliance: **Issues found.** Task quality: **Needs fixes.** Inactive lesson fields can prevent submission, and human grading omits supported scenario content. Both conflict with usable authoring and decisions-with-context requirements. No Critical findings.

## Important

1. **Inactive lesson fields still participate in validation.** `app/(workspace)/admin/courses/lesson-form.tsx:24` hides Quiz and Interview sections without disabling their controls. Enter101 for “Questions to draw,” then switch to Text: an otherwise valid Text lesson cannot submit because the invisible numeric input remains invalid. There is no visible explanation or focusable invalid field. Use disabled fieldsets for inactive types while retaining their values, and add a regression covering invalid input → type switch → successful submission.
2. **Human grading omits the question scenario.** `app/(workspace)/admin/reviews/page.tsx:65` renders `q.body.prompt`, the learner’s answer and rubric, but never `q.body.stimulus`. The new draft guide correctly displays that supported field as “Scenario” (`app/(workspace)/admin/reviews/question-guide.tsx:12`). A reviewer can therefore finalize a scenario-based answer without seeing the scenario. Render it before the answer and add a human-grading regression with a meaningful stimulus.

## Minor, deferred

- Completing a selected review leaves an empty detail pane. Selection filters strictly by the retained item parameter. After a decision removes that item from the pending queue, the shared form reloads the same URL, leaving no selected detail despite other pending items. Fall back to the next available item or show an explicit selection prompt. `app/(workspace)/admin/reviews/page.tsx:49`, `components/workspace-form.tsx:26`.
- New JSX is excessively compressed. Entire course-list/form and report-table structures occupy individual long lines, making behavioral changes and accessibility review harder. Format these normally and extract clear rendering units where appropriate. `app/(workspace)/admin/courses/page.tsx:15`, `components/workspace-ui.tsx:15`.

## Cannot verify

Final contrast/RTL/accessibility/performance qualification, repeated whole-product matrix and legacy PDF branding remain Task5 gates. Real AI/voice staging and physical iPhone remain UNVERIFIED. Controller resolves these as explicitly downstream requirements and accepted unavailable external gates, not omissions from Task4 acceptance.

## Strengths

- `lib/auth/login.ts:111`: reset issuance authorizes authenticated actor, enforces manager scope, rejects erased accounts and prevents forged audit attribution.
- `lib/reports.ts:26`, `lib/report-options.ts:9`: empty scope produces false while undefined admin scope remains unrestricted; filter parsing and team exports align page/API behavior.
- `components/workspace-form.tsx:16`: validation input preserved; mutations disabled during preparation/submission; activation codes kept out of URLs.
- `e2e/workspaces.e2e.ts:10`: actual UI and persisted cross-role completion, decisions, authoring, imports and scoped reports covered.

## Checks

Saved logs inspected:173 unit tests, build/typecheck passed;84 broad browser passes plus six missing-element hydration-fixture failures; corrected hydration6/6; narrow-screen16/16; original HR handoff6/6. No suite rerun.

One read-only Chromium validation probe matched the hidden-input structure: submit did not fire, validity false, browser reported `An invalid form control with name='pickN' is not focusable.`

Focused outside-diff checks: report/page authorization parity (`lib/auth/guard.ts`), review-action return/revalidation behavior (`admin/reviews/actions.ts`), supported scenario field (`lib/db/schema.ts:287`). Only missing resolveScope/runReport prelude and completion/compliance branches were read from changed `lib/reports.ts:23–106` because the diff cut them. No other changed files reread; no checkout mutations.
