# Task 4 — Manager and admin journeys

Status: implementation and scoped qualification complete; ready for independent Task 4 review. Stage acceptance and the 50–70% progress update belong to the controller after independent review.

## Scope and commits

- Review base: `5df07ac4f54cffa18544ce9f41033bc32cba3a0c`.
- `1a90dff` — manager/admin workflows, shared workspace actions, report and reset authorization repairs, cross-role links, unit and browser regression coverage.
- `698e05d` — failed-video transcript correction and saved-transcript retry, with browser regression; stronger URL acknowledgment before report screenshots.
- `c7e0721` — human-readable expected answers for all seven question types, realistic per-type fixtures, and mobile selected-review placement.
- `96f6f81` — prevent workspace mutations before client handlers mount; understandable preparing states for forms and reset issuance; deterministic pre-hydration coverage.

The managed checkout is `/Users/USER/.codex/worktrees/welearn-rework/CorporateTrainingApplication` on `codex/welearn-rework`. No dependency, environment, migration, seed reset, or production changes were made. Controller-owned personal fixtures were not mutated by these tests.

## Implemented behavior

Manager dashboard distinguishes assignment counts from people, sorts by urgency, provides URL-addressable search/status filters, and uses a desktop table that becomes compact mobile rows. Member detail groups current learning, course/path assignment with due dates, 48-hour reminders, private account recovery, completions, and oral checks. Assignments remain idempotent and scoped. Path notifications now open the actual learning path.

Admin overview prioritizes actionable queues. Course discovery and Curriculum/Settings authoring preserve five lesson types, with conditional fields, editable cover URL, certificate and sequential settings, reorder, oral-check editing, video reuse and ingestion status. People, Import, Groups and Rules have separate URL views; imports retain input and explain row errors, group creation and rule application persist, and one-time codes remain in client memory instead of URLs. Reviews, policies, tickets and integrity have readable lists/details, source context, human decisions and explicit acknowledged results. All seven question formats and human approval/finality boundaries remain intact.

Both reporting workspaces retain six reports with named filters, counts, matching CSV exports and disclosed Ask Reports interpretation. Empty manager scope now returns zero rows for all reports. Undefined scope remains available to authorized admins. Employee/course filters apply consistently. CSV and Ask APIs enforce the same MFA/privacy requirements as report pages; explicit team scope also keeps an admin's team workspace and exported data consistent.

Content navigation uses conventional document anchors, including manager members, admin overview queues, course views and the learner HR ticket handoff. Existing href/history semantics remain. Workspace forms disable the fieldset until client submission handlers mount, display an accessible preparing state, await the server action, disable the fieldset while pending, retain submitted values on errors, and acknowledge successful changes with a document refresh or destination navigation. This resolves observed persisted-but-stale publish and inbox states without claiming an unproven Next.js root cause.

The exported reset-code action now authorizes the session itself, rejects erased and other-team targets, and derives the audit issuer from the current session. A legacy issuer argument remains accepted but is ignored. Reminders use a rolling 48-hour deduplication window; other notification deduplication behavior is unchanged.

## Interfaces

- `WorkspaceForm`: action `(FormData) => Promise<ActionResult | void>`; `ActionResult` supports `error`, `success`, `href`, and private one-time `codes`. Validation errors do not reset inputs. Successful normal mutations reload the current URL, preserving selected view and filters.
- `WorkspaceLink`/`WorkspaceTabs`: native anchors with shared appearance and `aria-current`; no new routing API.
- `lib/report-options.ts`: shared names, filter parsing, and MFA/privacy predicate. Report API parameter `scope=team` is additive; manager requests always use the authenticated manager's team.
- `issueResetCode`: current-session ADMIN or scoped MANAGER authorization is required at the exported server-action boundary. Audit cannot be attributed to a supplied caller ID.
- `notify`: optional fifth `dedupeWithinMs` argument, used only for manager reminders. Default permanent dedupe remains compatible.
- Course video reuse points another lesson to the existing unique video record; it does not replace a saved transcript.
- Learner HR edits only change links. Reviewed-preview version checking, 409 refresh behavior, transactional ticket/body/consent checks, and assessment serialized save/final submission are preserved.

## Verification and evidence

All commands use Node 20.20.2. Browser runs use the isolated local HTTPS proxy at port 3443, one worker/report writer at a time, unique fixture identifiers, UI interactions for the behavior being qualified, and SQL only for prerequisites and persistence assertions.

On committed runtime `1a90dff`:

- `npm test`: 173 tests / 25 files passed (`.artifacts/task-4-unit-final.log`).
- `npm run typecheck`: passed (`.artifacts/task-4-typecheck-final.log`).
- `npm run build`: passed (`.artifacts/task-4-build-qualified.log`).
- `git diff --check`: passed.
- Impeccable detector on workspace routes and shared workspace components: zero findings (`.artifacts/task-4-impeccable.json`).
- Six-core browser qualification: **78/78 passed** in 7.6 minutes, covering 12 workspace stories plus unchanged controller auth-reset in Chromium/Firefox/WebKit desktop and 390px mobile. Log `.artifacts/task-4-six-core.log`; archive `.artifacts/task-4/browser-six-core/`.
- Original unchanged learner HR handoff regression: **6/6 passed**, including previously failing WebKit mobile. Log `.artifacts/task-4-hr-handoff.log`; archive `.artifacts/task-4/hr-handoff/`.

On `698e05d`, the 173-test full unit suite and typecheck pass again (`.artifacts/task-4-unit-recovery.log`, `.artifacts/task-4-typecheck-recovery.log`). The focused run on `c7e0721` then exposed a cold-load shared-form defect; it was stopped after 10 passes, one failure and one interruption (24 unrun), and is not represented as a passing qualification. See the following recovery evidence. Final broad-browser, corrected readiness and 360px/390px results are recorded below.

Browser invocation pattern:

```sh
env -u NO_COLOR -u FORCE_COLOR PATH=/Users/USER/.nvm/versions/node/v20.20.2/bin:$PATH npx playwright test e2e/workspaces.e2e.ts e2e/auth-reset.e2e.ts --project=chromium-desktop --project=chromium-mobile --project=firefox-desktop --project=firefox-mobile --project=webkit-desktop --project=webkit-mobile
```

Coverage includes a single-record admin publish → manager assignment → learner completion → certificate → manager/admin report and matching CSV story; all empty-scope reports and Ask; imports/groups/rules/person changes; grade decisions; ticket reply/resolution; integrity void; all five lesson authoring types; duplicate video reuse; policy versioning; path assignment and notification destination; every workspace view at 390px; inbox read state; repeat reminder after 48 hours; MFA/privacy report denial; all seven draft formats; oral confirm/overturn; and the controller's unchanged real reset-code recovery test.

Before reference: `.artifacts/baseline/expanded-screens/`, especially overflowing baseline editor `admin-admin-courses-detail-390.png`. After images: `.artifacts/task-4/screens-six-core/` (138 PNGs from passed cases). Some report captures in the initial runs show a navigation skeleton; the follow-up waits for the filtered URL and loaded table before capturing those reports again. Those initial report images are not visual qualification evidence. Browser traces, screenshots and reports are archived per run under `.artifacts/task-4/`.

## Final runtime qualification

Initial qualification application source was `96f6f81`; build passed (`.artifacts/task-4-build-final.log`). It includes `698e05d` ingestion recovery and `c7e0721` readable reviews. That initial local runtime used port 3100/session57767 with the controller's HTTPS proxy on3443. The current fix-round runtime is recorded below.

- Broad final run: **84 workflow/auth cases passed; 6 failed**, all six failures in the new JavaScript-disabled readiness fixture because Next's streamed content stayed unrevealed. Duration 10.6 minutes. No application workflow failed. This run is deliberately not called 90/90 green. Log `.artifacts/task-4-final-six-core.log`; complete archive `.artifacts/task-4/final-six-core/`.
- Corrected readiness fixture, same application build: **6/6 passed** across Chromium/Firefox/WebKit desktop and mobile. It blocks only external app bundles, checks visible disabled forms/reset buttons and preparing messages, then verifies real reset issuance after normal hydration. Log `.artifacts/task-4-hydration-six-core.log`; archive `.artifacts/task-4/hydration-six-core/`.
- Narrow-screen run: **16/16 passed** (eight template stories each at 360px and 390px, 2.4 minutes). Includes the same-record certificate/report chain, imports/groups/rules, human decisions, all five authoring types, policy versions, all workspace destinations, all seven readable question formats, and failed-video recovery. Log `.artifacts/task-4-small-final.log`; archive `.artifacts/task-4/small-final/`. Top-of-page captures remove the scrolled sticky-header artifacts; 52 PNGs are available in `.artifacts/task-4/screens-mobile-final/`.
- Test-only capture/fixture changes also pass typecheck (`.artifacts/task-4-typecheck-evidence.log`) and `git diff --check`.
- Final report images from successful broad-run cases: `.artifacts/task-4/screens-final/` (180 PNGs). Question guides use viewport captures. Some other broad-run full-page screenshots retain the known sticky-header capture artifact; the passing narrow-screen run replaces representative captures from scroll top. Final visual inspection confirmed the 360px recovery form, readable written-response rubric, mobile matching pairs and loaded manager transcript report. The table values are now loaded in report screenshots.

The final test-only correction does not change production code. Unaffected broad cases are not rerun solely for that fixture correction; the controller confirmed Task 5 will execute two complete clean final matrices. All final application workflows are qualified by the broad passes plus the corrected targeted case.

Additional command forms:

```sh
# The six core projects are the same list used above.
npx playwright test e2e/workspaces.e2e.ts --grep 'Workspace mutation forms' --project=chromium-desktop --project=chromium-mobile --project=firefox-desktop --project=firefox-mobile --project=webkit-desktop --project=webkit-mobile
npx playwright test e2e/workspaces.e2e.ts --grep '@template' --project=chromium-small --project=chromium-mobile
npx playwright test e2e/learner.e2e.ts --grep 'HR shows its heading' --project=chromium-desktop --project=chromium-mobile --project=firefox-desktop --project=firefox-mobile --project=webkit-desktop --project=webkit-mobile
```

## Failures investigated and resolved

- Baseline `userIds=[]` silently acted as unrestricted report scope. Focused red tests exposed it across all six report types; query construction now distinguishes an empty array from undefined.
- Baseline exported reset action trusted caller authorization and issuer ID. Red tests demonstrated unauthorized issuance and forged attribution; action boundary now enforces identity and scope.
- Initial browser run: five passes/seven failures. Test fixture needed an HR conversation ID, alert selection needed to target the application main content, and repeated YouTube IDs exposed a real uniqueness failure. Fixtures/locators were corrected and product video reuse was repaired.
- Initial targeted retry: five passes/one failure from a test navigating before the expected document reload completed. Tests now explicitly await the load acknowledgment they require.
- Second desktop/mobile qualification: 17 passes/one failure. Inbox mark-read persisted but did not acknowledge in the UI; converted to the same explicit workspace form lifecycle.
- Two intentional permission/reminder red cases: report endpoints returned data before MFA/privacy completion; reminders remained permanently deduplicated even after 48 hours. Both behavior defects were repaired and qualified in the current six-core run.
- Controller's independent mobile publish test found persistence without UI acknowledgment. Manual action invocation plus document refresh now acknowledges both publish and unpublish while retaining Settings context; controller confirmed this on `1a90dff`.

## Additional recovery finding

A real invalid transcript submitted through the UI leaves a failed video. The original editor had no transcript correction path and retry omitted the raw transcript from the queued job. The intentional red case is archived at `.artifacts/task-4/ingest-red/`, log `.artifacts/task-4-ingest-red.log`. The fix provides a replacement SRT/VTT field, validates before queuing while retaining invalid input, explains the failure, and retrieves the latest saved raw transcript for an empty manual retry. Status messages distinguish ready from queued and do not claim successful ingestion after failure.

## Review follow-up

Controller image inspection caught a usability and test-quality gap: matching/ordering relied on raw JSON, and the seven-type fixture populated irrelevant fields on every question. The revised fixture supplies only fields appropriate to each type; the browser asserts correct choice labels, true/false answer, accepted text, matching pairs, ordered steps, free-text scenario, rubric point allocation and model answer before persisting approval/discard. The red case on `698e05d` failed because the readable guide was absent; the same run passed real failed-video recovery. Archive `.artifacts/task-4/review-red-ingest-green/`; log `.artifacts/task-4-review-red-ingest-green.log`.

The review page now renders type-specific answer guides, removes raw JSON from the human review flow, uses readable type names, and puts the selected detail before the queue on mobile with a jump to choose another item. Desktop retains two columns. Matching/order and rubric content is visible without schema knowledge. Final review captures use viewport screenshots at scroll top to avoid sticky-header full-page artifacts.

## Cold-load form correction

The first same-record chain on a newly started `c7e0721` runtime clicked Create draft before the client handler hydrated. The form fell back to a native GET and put submitted fields in the URL instead of creating the course. Trace, screenshot and error context are preserved at `.artifacts/task-4/focused-cold-form/`; log `.artifacts/task-4-focused-final.log`. An initial browser context without JavaScript reproduced the enabled pre-hydration submit control (`.artifacts/task-4/hydration-red/`, `.artifacts/task-4-hydration-red.log`).

The fix disables mutation fieldsets until handlers are mounted, provides a live Preparing form message, and specifies POST as a fallback rather than leaking input into query parameters. Reset issuance has the same readiness guard with Preparing account help. No-script copy explains how to recover. Once ready, existing pending/error/success states and retained-input behavior continue. The regression covers both unhydrated controls and actual reset issuance after hydration; the full workspace/auth suite is repeated because this change is shared. All 173 unit tests and typecheck pass after the fix (`.artifacts/task-4-unit-hydration.log`, `.artifacts/task-4-typecheck-hydration.log`). The no-JavaScript fixture later exposed a harness limitation: Next sometimes streams a loading boundary that needs an inline script to reveal the server HTML, so the form was absent rather than enabled. A focused probe that blocks external application bundles while allowing inline reveal scripts confirms the controls are visible, disabled, and explained (`.artifacts/task-4-hydration-probe.log`); final coverage uses this more accurate pre-hydration setup.

## Controller personal browser evidence

Controller reports three successful independent 390px local IAB chains on `1a90dff`, using protected records outside automated fixtures:

- Admin creates a course/module/text lesson and 365-day certificate settings; publish/unpublish from Settings acknowledge immediately. Manager assigns it, learner opens its notification and completes it, certificate downloads correctly, and manager CSV/admin completion report match the same record.
- Admin replies to and resolves the learner’s existing HR ticket; learner refresh sees both.
- Actual learner free-text submission produces a provisional result with no completion/certificate; admin confirms the real review; learner sees a final-pass notification/result followed by course completion and earned certificate.

Controller also personally confirmed readable matching-pair review on `c7e0721`, and drawer → course search → Curriculum/Settings at 360px on `96f6f81`, with saved certificate settings and no page overflow. These are controller-observed results, not claims of a second automated run or external model qualification.

## Limits

Live external AI/transcript/voice provider behavior and physical iPhone testing remain explicitly unverified under the accepted project plan. Offline/demo AI results are not represented as a production model evaluation. Browser tests use local lawful manual transcripts and deterministic prerequisites. No deployment or production data was touched. Task 5 owns the complete repeated final matrix, global accessibility/contrast audit, remaining branding asset check, and final qualification acceptance.

## Fix round 1 — review base `5a64410`

Independent review findings: **Inactive lesson fields still participate in validation** and **Human grading omits the question scenario**. Starting HEAD was controller documentation commit `4323991`; the red reproduction ran against unchanged application runtime `96f6f81` on port 3100 / session 57767.

Source commit `730a293` fixes only these two Important findings:

- Each lesson-type section is a hidden **disabled fieldset** while inactive. Its mounted input values survive switching types; inactive inputs no longer participate in native validation or submitted form data. The covering authoring regression enters 101 quiz questions and 7 interview questions, verifies each active constraint blocks submission, switches back to confirm both values remain, then submits a valid Text lesson with those invalid sections inactive. Existing successful creation of all five lesson types, reordering, oral settings and video reuse remains in the case.
- Human grading renders the question's Scenario before the learner's answer. Its regression uses a damaged-package/out-of-stock scenario, asserts the actual text and heading are visible and positioned before the answer, then performs and verifies the persisted human adjustment/finality decision. Existing ticket reply/resolution and integrity outcome assertions remain.

No changes were made for the deferred queue-selection or compressed-JSX observations, and no business rules, dependencies, environment configuration, review actions or learner behavior changed.

Reproduction:

```sh
env -u NO_COLOR -u FORCE_COLOR PATH=/Users/USER/.nvm/versions/node/v20.20.2/bin:$PATH npx playwright test e2e/workspaces.e2e.ts --grep 'Type-specific|Human grade decisions' --project=chromium-mobile
```

Result: **2 expected failures** on `96f6f81` — hidden Questions to draw was enabled; Question scenario region was absent. Log `.artifacts/task-4-fix1-red.log`; archive `.artifacts/task-4/fix1-red/` contains traces, screenshots, HTML/JSON report and error contexts.

Verification on `730a293`:

- `PATH=/Users/USER/.nvm/versions/node/v20.20.2/bin:$PATH npm test`: **173 tests / 25 files passed**; `.artifacts/task-4-fix1-unit.log`.
- `PATH=/Users/USER/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`: **passed**; `.artifacts/task-4-fix1-typecheck.log`.
- `git diff --check`: **passed**.
- `PATH=/Users/USER/.nvm/versions/node/v20.20.2/bin:$PATH npm run build`: **passed** on application source `730a293`; `.artifacts/task-4-fix1-build.log`.
- Amended covering cases across all six core projects: **12/12 passed** in 1.5 minutes; `.artifacts/task-4-fix1-six-core.log`. Full report/trace archive `.artifacts/task-4/fix1-six-core/`; 48 successful captures `.artifacts/task-4/fix1-screens/`.

```sh
env -u NO_COLOR -u FORCE_COLOR PATH=/Users/USER/.nvm/versions/node/v20.20.2/bin:$PATH npx playwright test e2e/workspaces.e2e.ts --grep 'Type-specific|Human grade decisions' --project=chromium-desktop --project=chromium-mobile --project=firefox-desktop --project=firefox-mobile --project=webkit-desktop --project=webkit-mobile
```

Current running application: source/build `730a293`, production-mode local port 3100 / session 29099, HTTPS proxy 3443 unchanged. Controller commit `7b647c0` during verification was documentation-only. No application edits followed this build. Both Important findings are fixed and ready for scoped re-review against `5a64410`; deferred Minor items remain for Task 5 / final triage. External AI/voice staging and physical iPhone gates remain **UNVERIFIED**.
