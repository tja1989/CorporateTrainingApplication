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
