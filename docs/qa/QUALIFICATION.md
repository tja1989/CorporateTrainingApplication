# welearn qualification report

**Status: in progress. This is not a release approval.**

The accepted work covers all learner, manager, administrator, authentication and supporting workflows in [the rework plan](../WELEARN_REWORK_PLAN.md). Current accepted delivery progress is tracked in [PROGRESS.md](PROGRESS.md). No production deployment has been performed.

## Evidence rules

A passed route visit is not a passed workflow. Each required case must record role, prerequisites, browser actions, expected/actual outcome, persisted result, browser/viewport, build identity and evidence. Database/API setup may establish conditions or verify persistence; it cannot replace the user action being qualified. Browser mocks establish local contracts, not live-provider success.

- **PASSED:** the stated case and environment were verified.
- **FAILED:** the observed result contradicts the expected outcome.
- **PARTIAL:** only part of the required case or environment is verified.
- **NOT_TESTED:** required work remains.
- **UNVERIFIED:** required external access or hardware is unavailable; never counted as a pass.

The final deterministic suite must pass twice consecutively without retries. The final preview and reports must identify the source commit and any differences from the build used for each earlier result.

## Current evidence

| Area | Current result | Qualification limit |
|---|---|---|
| Baseline and shared foundation | Accepted; unit/build/typecheck, auth and navigation browser evidence in progress log | Whole-product qualification remains |
| Learner implementation | Accepted after independent review;148 units,36 browser slice cases and18 focused review regressions passed | Full cross-engine/branch qualification remains; review races corrected in6b10a63 |
| Migration | Additive resume column applied twice; historical fixture rows and old-column hashes preserved | Production migration has not been run |
| Real public video | Browser control on application commit `f008ba5`: seek to end earned only6%; pause at0:22 saved20.517seconds; leave/reopen resumed0:20; normal watching completed with no player remount or duplicate actions; course reload retained1/8 completed and issued no premature certificate | Local Chromium/public YouTube only; later player/progress changes require affected checks again. Transcript is illustrative, so timestamp mechanics do not prove semantic content accuracy. IAB cropped screenshots are excluded from visual qualification |
| Learner cross-engine slice | Initial run:91/92. The HR ticket handoff repair then passed the unchanged case6/6 across all core browser/device projects | Historical failure remains in `.artifacts/task-3-cross-engine-initial/`; repaired evidence is `.artifacts/task-4/hr-handoff/`. Final complete matrix remains required |
| Manager/admin | Accepted after scoped re-review of `730a293`; 173 units/build/typecheck and 12 amended browser cases passed | Earlier 84 workflow/auth passes, 6 readiness checks and 16 narrow-screen checks remain scoped evidence. The complete final matrix is still required |
| Qualification repairs | `f008ba5`:177 units/typecheck/build and9 focused browser regressions passed, including catalog history, tutor source destination, Unicode certificates, completed-sign-in API access, policy replacement, HR chain and review fallback | This is focused evidence; remaining workflow/service/voice branches, complete runs twice, accessibility and performance are still pending |
| Full workflow/visual/accessibility/performance matrix | Pending | Initial route/action enumeration does not prove coverage |

## Accepted external limitations

The user confirmed that approved staging access is unavailable and instructed us to record these gates as **UNVERIFIED**:

| Gate | Status | Needed for qualification |
|---|---|---|
| Real AI service integration in approved staging | UNVERIFIED | Approved environment with configured services and test data |
| Real voice service, interruption and reconnection in approved staging | UNVERIFIED | Approved configured environment and service access |
| Physical iPhone Safari microphone/media behavior | UNVERIFIED | Actual device and approved environment |

These limitations do not waive any locally testable workflow, permission, persistence, responsive or accessibility requirement. Client visual approval is separate from technical testing and has not been inferred from test results.

## Final handoff requirements

Before this report can become final, include the exact source/build identity, PR and preview, complete route/action/branch reconciliation, two clean suite-run manifests, cross-engine and cross-role results, responsive/theme/keyboard/RTL/zoom evidence, six-family performance measurements, dependency results, before/after images, traces, reproduction commands and migration/rollback instructions. List every failed, partial or unverified item explicitly.

- Initial coverage: [coverage-inventory.json](coverage-inventory.json), [workflow-cases.json](workflow-cases.json).
- Reproduction: [LOCAL_TESTING.md](LOCAL_TESTING.md).
- Data changes: [migration and rollback](../../migrations/README.md).
