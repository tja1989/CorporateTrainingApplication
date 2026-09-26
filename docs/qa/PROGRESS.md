# welearn rework progress

Plan: ../WELEARN_REWORK_PLAN.md

Overall: **50%**. Baseline, shared foundation and learner workflows accepted; manager/admin workflows next.

| Phase | Weight | Status | Evidence |
|---|---:|---|---|
| Baseline/inventory/environment | 10% | Complete | baseline117 tests + typecheck + build; PG16+pgvector;26 before screenshots |
| Design system/branding/shells | 15% | Complete |126 units/build/typecheck;51 auth +45 nav +4 shared-surface browser checks; independent review approved |
| Learner workflows | 25% | Complete | 148 units/build/typecheck;36 browser slice cases plus18 review regressions; scoped review approved |
| Manager/admin workflows | 20% | In progress | Task4 begins after accepted learner review |
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
- Independent Task2 review found mixed workspace context when manager/admin opens My profile; manually reproduced. Fix round1 adds route-context header/account consistency and browser regressions. Four red cases failed for intended missing learner navigation/search before correction.
- Review minor carried into Task3: restore visible provisional/streaming indicator removed with legacy .stream-cursor CSS. All-flow keyboard/RTL/zoom remains Task5; no final qualification claimed.
- Shared visual gap resolved: compact lesson header and 404 recovery surface pass4/4 at1440/390 in light/dark; header/system axe has no serious/critical violations; Go home recovery works. Personally inspected all8 screenshots for readable text, unclipped shell controls and correct theme. Evidence:`.artifacts/task-2-shared-surfaces-final.log`, `.artifacts/task-2-shared-surfaces-qualified/`. Lesson content layout is still Task3 scope.
- Profile fix committed915339e. Expanded navigation suite45/45 passes all9 engine/viewport projects, including18 manager/admin profile-entry/refresh/continued-navigation/role-return cases; manual manager browser check also passed. Scoped re-review pending. Evidence:`.artifacts/task-2-profile-nav-qualified.log`, `.artifacts/task-2-profile-qualified/`.

- Task2 scoped review approved915339e: profile finding addressed, no new Critical/Important breakage. Baseline/shared phases accepted:25%. Streaming indicator minor is explicitly assigned to Task3. Historical red log had conflicting color-environment warnings; final build/navigation logs clean, historical evidence retained unedited.
- Task3 migration applied to local welearn_dev after a backup; rerun idempotent. Public progress table was empty, so actual migration was also applied twice to a temporary copy with completed/in-progress fixture history: all prior columns' aggregate hash unchanged,2 rows preserved, both new positions null. Evidence:`.artifacts/task-3/resume-history-check.log`; no baseline/production data touched.
- Expanded before evidence: original checkout still clean atdd8bd11, separate seeded welearn_baseline DB and port3200.62 route screenshots +2 sign-in screens (31 routes,1440/390) at `.artifacts/baseline/expanded-screens`, runtime/source metadata beside manifest. Confirmed original mobile course-editor overflow; Task4 must resolve. These are visual captures, not workflow pass claims.
- Public-provider availability probe: real YouTube WHO video `3PmVJQUCm4E` played to the visible end (1:26/1:26) in local Chromium browser control. Existing seed metadata incorrectly said148 seconds, leaving60% watched at the end. Corrected that one local synthetic video row to86 seconds without changing progress; Task3 owns seed/remediation and final playback qualification. Server-authoritative duration must remain; accepting arbitrary client duration would weaken the completion threshold. Evidence: `.artifacts/task-3/video-metadata-repair.log`. Real AI/voice and physical iPhone gates remain UNVERIFIED as accepted by the user.
- Added manager-mediated password reset browser chain: desktop passes issuance/audit/old-password rejection/recovery/new-session login; mobile exposes existing first-click team-member navigation failure. This manager-page defect is assigned Task4, with unchanged assertions and preserved trace/screenshot evidence in `.artifacts/auth-reset-before-task4/`. Reset family remains PARTIAL until repaired and cross-engine qualified.
- Task3 first build:141 unit tests/typecheck/build passed. Personal browser checks confirmed Home→lesson in one action, text completion/refreshed persistence/next lesson, subordinate Markdown headings, mobile contents drawer and Escape focus, catalog query persistence and one-action course access. Automated fast-navigation cases exposed pending completion/stale HR reply after successful server persistence on bothHTTP/HTTPS; Task3 is correcting acknowledgment/navigation, not weakening expectations.
- Real mobile Chromium video check on a fresh synthetic learner: pause at1:04, saved63.44sec; leave via course overview and reopen at1:03 with72%watched, continue to finalCOMPLETED with buckets0–16/last82.72sec. Actual provider was used. Crossing threshold refreshed/remounted the player and duplicated completion/oral actions; both assigned Task3 before acceptance. This is interim working-tree evidence, not final all-engine qualification.
- Mobile My Learning review: stacked secondary filters buried all courses below the first viewport. Task3 is collapsing secondary filters behind a labeled disclosure with active-count while preserving search/apply/reset/URL state; desktop retains expanded filtering.
- Prepared production mobile performance harness with exact-build metadata,3 samples/family, controlled CPU/network/cache, LCP/CLS/representative interaction metrics and evidence. Home-only runtime smoke passed (median844ms LCP,0CLS,64ms interaction upper bound) on the interim Task3 build; this validates the harness, not the final six-family gate. Evidence:`.artifacts/performance-smoke/results.json` and `.artifacts/performance-smoke.log`.
- Task3 follow-up browser suite20/24 passed; prior completion/reply failures and player-instance regression now pass. Remaining findings include the duplicated learner inbox route, policy Markdown/section targeting and mobile filter input width; an oral fixture was below the existing80-character content minimum and is being corrected without weakening the production rule. Personal mobile HR cancel→0tickets/confirm→1ticket/reply→refresh persistence passed on synthetic records.
- Personal full-journey checks found additional local blockers: offline HR voice advertises typed mode but waits indefinitely for microphone permission with Type instead disabled; Practice selects an ordering question but exposes only an unstructured text field without the items to order. Task3 owns both fixes and regressions. No real microphone permission was granted; End conversation returned to the ended state. Mobile profile in dark mode remains readable and shows no unearned completion/certificate.
- Ordered-path inspection confirmed the existing lock was presentation-only. Ruling for the accepted PATH prerequisite requirement: enforce earlier-course completion for actual active ordered-path assignments, including rules targeting a path, while unrelated published courses remain open and historical completions stay intact. Controller added an explicit two-course browser regression; Task3 owns the shared entry guard for course/lesson/completion/video/assessment/oral entry. This repairs prerequisite enforcement without adding a general enrollment requirement.

- Rebuilt mobile manual checks pass for offline typed start without microphone, ended-session recovery, semantic citation focus, full-width search with persistent query and all six Practice answer types through a5/6 final result. Ordered-path red test definitively exposed two forbidden lesson links before the new guard; the rebuilt four manual/rule path browser cases pass in the current expanded run. Final learner suite still has other failures under diagnosis; phase remains25%.
- Learner rebuilt desktop/mobile suite passes36/36 with no retries (`.artifacts/task-3-final-browser.log`): ordered path and rule assignments, all five content entries, seven assessment inputs, six Practice inputs, persisted completion/reply, policy citation/read states, offline typed consent/results, catalog Back restoration and video completion without player teardown. Unit148/typecheck/build pass. Native course-card links restore browser history; authoritative scoped completion outlines update the lesson footer and contents without a refresh race. Independent Task3 review is next; accepted progress remains25% until review passes.

- Task3 independent review found HRpreview/confirmationdrift and delayedautosave overwriting finalanswers. Both reproduced inbrowser, including wrongstoredanswer and0/1grade, thenfixedin6b10a63. Eighteenfocuseddesktop/mobilechecks,148units/typecheck/buildpass; scopedreviewapproved bothfixesandformatting withno newCritical/Importantfindings. Learnerphaseaccepted:50%. FinalmatrixremainsTask5.
- Task3 rulings: optionaloralcheck preserves baseline-supportedTEXT/VIDEO; PDFextractionwasneverexistingfunctionality andisnotaddedfromambiguousbriefwording. RealPDF rendering/fallback andillustrativeWHOtranscripttimestampmismatchremainexplicitTask5checks. Historicalfixlogcolorwarningsarepreserved; removeNO_COLOR/FORCE_COLORconflict fromfinalqualificationenvironment.

- Initial learner cross-engine qualification on runtime6b10a63:91/92 passed across Firefox/WebKit desktop/mobile,0 skips/retries. Mobile WebKit created the HR ticket correctly but “View your ticket” stayed on HR Help. Existing assertion remains unchanged; Task4 owns this cross-role handoff fix and its six-core-project rerun. Archived logs, trace, screenshot and build/source provenance: `.artifacts/task-3-cross-engine-initial/`; log `.artifacts/task-3-cross-engine.log`. This is partial qualification, not a final pass.

- PDF fallback browser workflow passes6/6 in Chromium/Firefox/WebKit desktop/mobile on runtime6b10a63: clicked the actual fallback, received matching PDF bytes, marked complete and verified refresh/database persistence. Headless engines download PDFs; no native inline-rendering claim. Test:`e2e/media-fallback.e2e.ts`; evidence:`.artifacts/pdf-fallback-initial/`, log beside it. Include this case in final qualification.

- Task4 first production build/typecheck passed. Personal390px browser authoring created a course/module/text lesson and saved certificate rules; Publish from Settings persisted to DB but left the page pending. Task4 is repairing mutation acknowledgment and retaining the failing workflow. Initial automated Chromium desktop/mobile cross-role training chains and empty-team six-report/CSV/Ask isolation passed; full Task4 acceptance still awaits amended tests and independent review.
