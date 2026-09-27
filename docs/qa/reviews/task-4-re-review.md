# Task4 scoped re-review —730a293 (report HEAD2eacb04)

- **Inactive lesson fields still participate in validation — ADDRESSED.** All five type sections now use disabled fieldsets when inactive, excluding hidden controls from validation and submission while preserving mounted values (`app/(workspace)/admin/courses/lesson-form.tsx:21`). The amended regression verifies active constraints, retained invalid Quiz/Interview values, then successful Text creation (`e2e/workspaces.e2e.ts:211`).
- **Human grading omits the question scenario — ADDRESSED.** Grading detail renders q.body.stimulus in a labeled Scenario section before the learner’s answer (`app/(workspace)/admin/reviews/page.tsx:66`). Regression checks content, visibility and placement before persisted human adjustment (`e2e/workspaces.e2e.ts:171`).

## New breakage

None found.

## Verification

Saved red evidence inspected: both regressions failed for expected defects. Saved green evidence inspected:12/12 amended workflow cases across all six core browser projects;173/173 units, typecheck and production build passed, with no unexplained warnings. Fix package read once, no tests rerun, no outside-source checks needed, no checkout changes.

## Out-of-scope observations

No new observations. Prior minor queue-selection and JSX-formatting findings remain deferred.

**Fix round: All findings addressed, no new Critical/Important breakage.** Both Important spec and quality findings are resolved.
