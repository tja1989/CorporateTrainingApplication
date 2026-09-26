# welearn rework progress

Plan: ../WELEARN_REWORK_PLAN.md

Overall: **10%**. Baseline complete; shared design implementation in progress.

| Phase | Weight | Status | Evidence |
|---|---:|---|---|
| Baseline/inventory/environment | 10% | Complete | baseline117 tests + typecheck + build; PG16+pgvector;26 before screenshots |
| Design system/branding/shells | 15% | In progress | Astra/xhigh implementer; acceptance and review pending |
| Learner workflows | 25% | Pending | |
| Manager/admin workflows | 20% | Pending | |
| Browser qualification | 25% | Pending | |
| Review/handoff | 5% | Pending | |

## Decisions

- 2026-09-26: user approved full plan and product name welearn, then requested execution with Astra extra-high.
- Source checkout was empty; cloned supplied repository, native tool created managed worktree, branch codex/welearn-rework from main.
- Test environment will be isolated from deployed data and provider credentials. Existing PostgreSQL14 is not the planned16; installed16 binaries will serve a dedicated local cluster.

## Preflight interface review

| Tasks | Shared interface | Finding |
|---|---|---|
| 1→all | Runtime, DB, baseline | Provision standalone test cluster and document commands. |
| 2→3/4 | Tokens/primitives/shells | Sequential ownership; preserve component exports where practical. |
| 3→4 | Course covers/progress/outline | CoverUrl already exists; resume field additive and shared query service. |
| 3/4→5 | Roles/actions/fixtures | Real backend and cross-role checks; fixture writes cannot replace UI actions. |
| 5→6 | Evidence/commit | Requalify amended areas after review, keep exact artifact commit. |
| 1-6 internal | Scope vs gates | Full user plan preserved above; no phase implies live integration/iOS evidence that was not obtained. |

## Evidence log

- npm ci baseline:174 packages installed; audit reported9 vulnerabilities (7 moderate,2 high). Investigation pending; no blind force update.

- Baseline117 unit tests, typecheck and production build passed (logs in `.artifacts/baseline`). Dedicated PostgreSQL16.14 on127.0.0.1:55436, databasewelearn_dev, pgvector0.8.5. Existing system DB untouched.
- Captured24 representative pages plus2 login screens at1440×900 and390×844. Reduced motion and animation completion used so evidence shows final page content, not skeletons or count-up intermediates. Manifest:`.artifacts/baseline/screens/manifest.json`.
- Initial source inventory37page routes/35app server actions/22API routes; shared auth actions and client behaviors are expanded in workflow matrix. Page visits are baseline captures, not workflow passes.
- Browser engines installed locally: Chromium153,Firefox155,WebKit26.6. Project runner uses real local backend, no retries, per-test dedicated QA accounts.
- Confirmed baseline defects: form labels not associated with controls; HR chat missing visible page heading; mobile workspace navigation hidden in a horizontal strip; mandatory admin MFA setup can be bypassed by direct URL (source finding, browser regression added).
- Ruling: scope qualification to the isolated local environment while preserving real-provider and iOS gates as unverified until credentials/hardware are available — avoids production data changes; costs a separate staging/hardware run before release.

- User clarification: no approved staging access yet; record real AI/voice staging and real iPhone microphone/media gates as **UNVERIFIED**. Complete all local work and available browser qualification; do not present these unavailable integrations as passed.

- Task2 first browser pass:12/14 passed, two manager link-navigation failures (desktop/mobile). Agent isolated speculative workspace prefetch racing navigation after login; fix under validation, no test timing workaround.
- Additional auth lifecycle tests: activation password mismatch recovery, persisted setup and one-time code consumption passed on both viewports; MFA invalid-code correction, setup/consent, and configured-secret replacement guard passed on both.
- Confirmed existing report scope defect: `userIds: []` currently expands to allusers in report engine. Task4 brief explicitly requires empty-team isolation tests/repair before release.

- Task2 navigation investigation: prefetch toggle did not resolve the intermittent first-click failure (15/18 second run;3failures). Direct loads consistently work. Native workspace anchor experiment passed8/8; final unchanged browser validation pending.
- Ruling: use ordinary document links in manager/admin workspace navigation — observed client-router transitions intermittently lose the first selection while native navigation is reliable; cost is a full page request on workspace changes. Preserve learner SPA navigation and all hrefs/history/access rules.
- Task2 cross-engine run exposed an environment issue: WebKit discards the production Secure cookie on HTTP localhost, confirmed by cookie-attribute comparison (no token logging). Added a loopback HTTPS QA proxy and local certificate handling; production cookie security remains intact. HTTPS matrix follows without weakening workflow assertions.

- HTTPS Task2 matrix:64/66 pass; all authentication flows now pass in Chromium, Firefox and WebKit. Two mobile WebKit cases expose missing focus restoration on drawer Escape; implementation fix pending. Failure evidence: `.artifacts/task-2-https-before-focus`, `.artifacts/task-2-https-matrix.log`.
- Personal browser control at390×844 verified mobile manager drawer open, Escape and focus return in Chromium, then My team destination. This establishes manual evidence for that engine only.

- Task2 implementation committed as `cea8c31`. Focus restoration fix passes unchanged navigation matrix27/27 across all9 viewport/engine projects; earlier39/39 auth cases pass. Whole unit126/126, typecheck and production build pass. Fresh independent review pending; phase acceptance remains at10% until clean review.
- Additional login recovery suite12/12 passed in Chromium/Firefox/WebKit desktop/mobile: expired signed session redirects, normal sign-in recovers, logout+Back stays protected; invalid/expired activation codes retain input and leave account invited. Initial harness alert selector was narrowed to the form to exclude Next route-announcer; no application change or weaker assertion. Evidence:`.artifacts/task-2-auth-recovery-final.log`.
