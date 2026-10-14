# Course and instructor feedback implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees rate completed courses and their actual instructors, with persistent edits, protected comments, scoped reports and weekly/monthly feedback digests.

**Architecture:** Delivery snapshots bind feedback to the completed enrollment cycle. Separate content/instructor response tables and append-only revisions enforce uniqueness and report cutoff accuracy. Every report/export/digest uses the centralized role/scope boundaries delivered by the first plan.

**Tech Stack:** Existing Next.js/React/TypeScript, Drizzle/PostgreSQL, Vitest, Playwright and in-app notification dispatcher; no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-client-feedback-design.md`, approved by the user on 14 October 2026. Depends on completed `docs/superpowers/plans/2026-10-14-client-roles-approval.md` and its approved role design.

## Global constraints

- Use attributed 1–5 whole-number ratings and optional text comments of at most 2,000 characters.
- Do not describe responses as anonymous.
- Do not make feedback a condition for earning the course completion or certificate.
- One response of each kind is allowed per employee and completed learning cycle.
- Feedback is separate from the existing HR assistant thumbs-up/down and assessment grading feedback.
- Never create default ratings for nonrespondents.
- Empty department/course assignments produce empty results.
- Week starts Monday; months use calendar-month boundaries.
- An edit does not become a second response or move the original submission into a later period.
- No permanent deletion through ordinary feedback controls.
- User-supplied comments are content, not instructions to assistants or report generators.
- Real email depends on the email-transport delivery phase; logging or an in-app digest does not qualify email delivery.
- Use the existing xprtn component contract, light/dark themes, keyboard access and mobile layout.

## Review focus

1. An employee-ID, course-ID or instructor-ID supplied by a form must not permit another person's feedback or a non-delivered trainer — Tasks 1 and 2.
2. Reassigned instructors and repeat certification cycles must preserve the historical recipient and one-response-per-cycle boundary — Tasks 1 and 2.
3. CSV/download/digest paths must not disclose learner identity or out-of-department comments where the corresponding page hides them — Task 3.
4. Ratings amended after a month closes and concurrent edits must not rewrite historical cutoff reports silently — Tasks 2 and 3.
5. Moderation and the existing personal-data export/erasure flow must preserve necessary audit history without leaving exported private comments behind — Task 4.

Use the isolated database/app/capture directory established by the roles plan. Never reset the clean demo or Railway database. Fetch concurrent main work before integration.

---

## Task 1 Delivery context and additive feedback storage

**Files**
- Create `migrations/20261014_course_feedback.sql`, `lib/feedback/delivery.ts`, `lib/feedback/types.ts`, `tests/feedback-delivery.test.ts`.
- Modify `lib/db/schema.ts`, `lib/lms/rules.ts`, `lib/lms/completion.ts`, `scripts/deploy-init.ts`, `scripts/qa-client-migration.ts`, `migrations/README.md`.

**Interfaces**
```ts
export type FeedbackKind = "course" | "instructor";
export type FeedbackInput = { completionId:string; kind:FeedbackKind; rating:number; comment:string; expectedRevision:number; requestId:string };
export type DeliverySnapshot = { id:string; enrollmentId:string; courseId:string; departmentId:string|null; instructorId:string|null; completedRecordId:string|null };
export async function snapshotEnrollment(tx:LearningTransaction,enrollmentId:string): Promise<DeliverySnapshot>;
export async function linkCompletionDelivery(tx:LearningTransaction,enrollmentId:string,completionId:string): Promise<void>;
```

- [ ] **Step 1 Write delivery/migration red tests.** In a real local DB, roll out a course assigned to Instructor A, then reassign the course to B and complete the original enrollment; expect its delivery instructor to remain A. Create a second renewal enrollment assigned to B and expect a distinct delivery. Legacy completion with no snapshot must have instructorId null. Extend the migration preservation probe to apply this SQL twice without changing earlier completion/attempt/certificate hashes.
```ts
it("later reassignment cannot retarget the original delivery", async () => {
  const delivered = await readDelivery(firstEnrollmentId);
  expect(delivered.instructorId).toBe("trainer-a");
  expect((await readDelivery(renewalEnrollmentId)).instructorId).toBe("trainer-b");
});
```
`readDelivery` is a test-local pg SELECT helper. Run `npm test -- tests/feedback-delivery.test.ts` and the isolated migration probe; record failures.

- [ ] **Step 2 Add storage with database constraints.** Define `course_deliveries` with unique enrollment ID, nullable instructor/department and unique nullable completion ID. Define `course_feedback` and `instructor_feedback` with unique `(employee_id,completion_record_id)`, rating CHECK 1–5, comment, revision default 1, moderation fields and created/updated timestamps. Define `feedback_revisions` with response kind/ID, employee actor, old/new rating/comment/moderation values, revision, timestamp and unique request ID. Enforce kind and revision validity. Add read indexes by course/instructor/department/time. New creation appends the initial revision as well, making as-of report reconstruction complete.

- [ ] **Step 3 Capture and link snapshots transactionally.** `enrollUser` and rule-based enrollment creation call `snapshotEnrollment` only for new enrollment rows, reading actual course department/instructor at that moment. Snapshot values remain immutable. `completeCourse` obtains the returned completion-record ID and links it to that active enrollment's snapshot in the same existing completion transaction. Legacy unsnapshotted completion remains course-feedback eligible but cannot receive an invented historical instructor. Do not reset scores, progress or certificates to establish a delivery record.

- [ ] **Step 4 Verify and commit.** Run the delivery tests and repeat migration probe, existing rule/renewal/completion tests, `npm test`, typecheck. Commit `feat: preserve delivered instructor context for feedback`.

## Task 2 Employee submissions edits and conflict recovery

**Files**
- Create `lib/feedback/validation.ts`, `lib/feedback/service.ts`, `app/(learner)/course/[courseId]/feedback/page.tsx`, `app/(learner)/course/[courseId]/feedback/actions.ts`, `components/course-feedback-form.tsx`, `tests/feedback.test.ts`, `e2e/client-feedback.e2e.ts`.
- Modify `app/(learner)/course/[courseId]/page.tsx`, `app/(learner)/profile/page.tsx`.

**Interfaces**
```ts
export type FeedbackValidation = {ok:true;rating:number;comment:string} | {ok:false;error:string};
export function validateFeedback(rating:unknown,comment:unknown): FeedbackValidation;
export async function saveFeedback(actor:Actor,input:FeedbackInput): Promise<{id:string;revision:number;rating:number;comment:string;updatedAt:Date}>;
export async function ownFeedback(userId:string,completionId:string): Promise<{course:SavedFeedback|null;instructor:SavedFeedback|null;delivery:DeliverySnapshot|null}>;
export type SavedFeedback = {id:string;rating:number;comment:string;revision:number;updatedAt:Date;commentHidden:boolean;excluded:boolean};
```

- [ ] **Step 1 Write eligibility/validation/concurrency tests.** Use whole-number literals for accepted 1/5 and rejected 0/6/1.5/NaN/string garbage, boundary comments 2,000/2,001 and multiline Unicode. In the real DB, reject incomplete/other-user completions and an unrelated instructor. Test duplicate request replay yields the same response without duplicate audit rows; two writes at expectedRevision 1 cannot both become revision 2.
```ts
it("rejects a fractional rating", () => {
  expect(validateFeedback(2.5,"Useful examples")).toEqual({ok:false,error:"Choose a whole-number rating from 1 to 5."});
});
it("records a second edit without adding a respondent", async () => {
  const employee:Actor = {id:"employee",role:"LEARNER",departmentId:"a"};
  const saved = await saveFeedback(employee,{completionId:"done",kind:"course",rating:4,
    comment:"Clear instructions",expectedRevision:1,requestId:"edit-2"});
  expect(saved.revision).toBe(2);
  expect(await responseCount("done","course")).toBe(1);
});
```
`responseCount` is a test-local pg helper. Run `npm test -- tests/feedback.test.ts` and keep the intended red output.

- [ ] **Step 2 Implement the transactional service.** Read the completion owner and immutable delivery on the server; do not accept employee/instructor/department IDs from the form. Validate rating/comment, lock the response key `(kind,userId,completionId)`, enforce expected revision and append initial/edit revisions atomically with the current row. Replays must match actor/kind/completion; mismatched request IDs are conflicts. Saving is independent from course completion/certificate issuance.

- [ ] **Step 3 Build the employee journey.** The feedback page validates completion ownership before showing any course/instructor information. A Content rating/comment section is always available for eligible legacy/current completions; an Instructor section appears only for a known delivery trainer. Provide radio labels 1–5, optional comment fields, retained values on errors, current revision tokens and a saved timestamp. The disclosure states attribution and who can see comments, including inference risk in small groups. Show moderation state to the author. Completed course overview/profile links read Give/Edit feedback from persisted state; neither course progress nor certificate depends on submission.

- [ ] **Step 4 Verify and commit.** Use browser UI to submit course/instructor feedback, reload, amend, reload again and inspect one persisted response with two audit revisions. Test a stale tab and direct other-employee request. Run the new unit/browser checks, existing profile/completion tests and the full unit/type checks. Commit `feat: add persistent course and instructor feedback`.

## Task 3 Scoped reports period boundaries and exports

**Files**
- Create `lib/feedback/periods.ts`, `lib/feedback/reports.ts`, `app/(workspace)/feedback/page.tsx`, `app/api/feedback/reports/csv/route.ts`, `components/feedback-reports.tsx`, `tests/feedback-reports.test.ts`, `tests/feedback-periods.test.ts`, `e2e/client-feedback-reports.e2e.ts`.
- Modify `lib/navigation.ts` to add permitted Feedback reports destinations for HR/Department Head/Instructor/Admin.

**Interfaces**
```ts
export type FeedbackPeriod = {start:Date;end:Date;label:string}; // start inclusive, end exclusive
export function feedbackPeriod(kind:"week"|"month"|"custom",now:Date,tz:string,custom?:{start:string;end:string}): FeedbackPeriod;
export type FeedbackReportFilters = {kind:FeedbackKind;period:FeedbackPeriod;courseId?:string;instructorId?:string};
export async function feedbackReport(actor:Actor,filters:FeedbackReportFilters): Promise<FeedbackReport>;
export type FeedbackReport = {columns:string[];rows:Array<Array<string|number>>;responses:number;average:number|null;distribution:[number,number,number,number,number]};
export function feedbackCsv(report:FeedbackReport): string;
```

- [ ] **Step 1 Write time/privacy/report red tests.** Hand-check a Monday week boundary, month-end and UTC-to-organization-time transitions. Use `Intl`/existing timezone helpers rather than host timezone; invalid/reversed/oversized custom ranges return a validation error. Test late edit after period end: the historical report must use its earlier audit revision. Empty datasets have average null/count 0. Instructor exports must lack employee ID/name columns; Department Head sees only own-delivery department records and only aggregate instructor feedback. Add an overlapping group/out-of-department row and confirm it is excluded.
```ts
it("no response is not a zero-star score", async () => {
  const emptyDepartment:Actor = {id:"empty-head",role:"DEPARTMENT_HEAD",departmentId:"empty"};
  const filters:FeedbackReportFilters = {kind:"course",period:{
    start:new Date("2026-09-30T20:00:00Z"),end:new Date("2026-10-31T20:00:00Z"),label:"October 2026"}};
  const report = await feedbackReport(emptyDepartment,filters);
  expect(report.responses).toBe(0);
  expect(report.average).toBeNull();
  expect(report.rows).toEqual([]);
});
```

- [ ] **Step 2 Implement period and report queries.** Filter cohort by original submission in `[start,end)`. Select each response's latest revision strictly before period end; later edits cannot change a closed period. Apply stored delivery department/instructor context and current actor role scope. HR/Admin may see attributed detail; Instructor only own-delivery comments without identity; Department Head gets attributed course detail and aggregate instructor results. Apply current comment visibility even when reconstructing old rating revisions, so a comment hidden later cannot resurface in a historic report/export. Exclusion/count state follows the chosen cutoff; current-period reports reflect current exclusions. Hidden valid ratings still count. Build distribution counts using actual respondents, never nonrespondents. Add the hidden-after-cutoff privacy regression to the report suite.

- [ ] **Step 3 Add report UI and CSV using one service.** Course/Instructor tabs, week/month/custom filters, average/distribution/count and permitted comments use the same `feedbackReport` result as CSV. A form/request cannot override actor scope. Display No responses when average is null; label period/timezone. CSV escaping handles commas, quotes, newlines and Unicode and neutralizes spreadsheet formula prefixes in text cells. Instructor/Department Head direct CSV requests get exactly the same restrictions as pages. Validate keyboard/mobile table-region behavior through the existing component patterns.

- [ ] **Step 4 Verify and commit.** Browser checks traverse HR, Department Head and Instructor views/exports against a known fixture and compare page/report/CSV totals and identities. Run new report/period tests and existing report privacy checks, then full unit/type/build checks. Commit `feat: add scoped course and instructor feedback reports`.

## Task 4 Moderation personal-data flows and period digests

**Files**
- Create `lib/feedback/moderation.ts`, `lib/feedback/digests.ts`, `scripts/feedback-digests.ts`, `app/(workspace)/feedback/actions.ts`, `tests/feedback-moderation.test.ts`, `tests/feedback-digests.test.ts`.
- Modify `lib/notify.ts`, `components/inbox-list.tsx`, `lib/dsr.ts`, `package.json`, `docs/qa/CLIENT_FEEDBACK.md`.

**Interfaces**
```ts
export async function moderateFeedback(actor:Actor,input:{kind:FeedbackKind;id:string;expectedRevision:number;hidden:boolean;excluded:boolean;reason:string;requestId:string}): Promise<void>;
export async function runFeedbackDigests(kind:"week"|"month",now?:Date): Promise<{sent:number;alreadySent:number}>;
```

- [ ] **Step 1 Write moderation/data-request/dedupe red tests.** Instructor/Department Head cannot moderate; HR/Admin require reason. Hidden comments disappear from permitted ordinary reports while valid rating stays included; explicit invalid-response exclusion changes counts and is audited. A personal-data export includes the employee's course/instructor feedback and own revisions; erasure removes/scrubs their private comment content through the existing authorized DSR flow, preserving necessary de-identified aggregates/audit as defined by that flow. A repeated weekly/monthly digest creates one notification per recipient/kind/period and records zero new sends on rerun.

- [ ] **Step 2 Implement moderation and personal-data handling.** Lock the response, check revision/permission/reason, append a moderation event and change only the requested visibility/exclusion fields. Never permanently delete from ordinary UI. Extend `exportUserData`/`eraseUser` to cover new comment/revision content; keep completion/certificate handling unchanged. Erased/inactive profiles cannot read or submit feedback. Protect hidden originals from Instructor/Department Head exports and exclude them from AI-assisted report inputs.

- [ ] **Step 3 Implement deterministic weekly/monthly digests.** Generate the just-finished organization-time period, select current authorized recipients, call scoped `feedbackReport` and notify with key `feedback:${kind}:${recipientId}:${period.start.toISOString()}`. Add dedicated course/instructor feedback templates and filtered report links; no privileged IDs in another role's body. Track each completed period and report partial failures; retries finish unsent recipients without duplicating prior deliveries. Expose `npm run feedback:digests -- week|month` through a script that loads env and validates the argument. Document weekly/monthly Railway cron commands and last-run evidence; keep this separate from retention sweep. Do not call console output successful email delivery.

- [ ] **Step 4 Verify and commit.** Test actual scoped notifications and reruns in the isolated DB, then browser moderation and saved author state. Run new files, existing HR notification/DSR-related checks and full unit/type checks. Commit `feat: add audited feedback moderation and period digests`.

## Task 5 Cross-role qualification main integration and handoff

**Files**
- Modify `e2e/client-feedback.e2e.ts`, `e2e/client-feedback-reports.e2e.ts`, `docs/CLIENT_DEMO.md`, `README.md`, `docs/qa/PROGRESS.md`, `docs/qa/CLIENT_FEEDBACK.md`, `migrations/README.md`.

- [ ] **Step 1 Qualify the full real-backend flow.** Instructor→Department Head→HR approval/rollout, Employee course completion/certificate, both feedback submissions and edits, each role's reports/CSV, moderation and weekly/monthly digest. Preserve fixture setup versus actual UI actions; keep network/privacy/permission negatives and stale-edit races. Run desktop/mobile Chromium and @core Firefox/WebKit cases; label external email scheduling/provider/device evidence separately.
- [ ] **Step 2 Review the final implementation.** Fresh independent review checks eligibility, historical instructor snapshots, response uniqueness, revision-cutoff reporting, data-request/comment handling, moderation reasons and every page/API/export/digest permission boundary. Incorporate Opus UI findings without weakening those contracts.
- [ ] **Step 3 Reconcile main and verify the merged result.** Fetch main, inspect audit changes, merge main into the isolated branch, resolve conflicts preserving both sets of work, then run `npm test`, `npm run typecheck`, `npm run build` and affected browser suites on the combined tree. Integrate/push to main under the user's authorization; never discard uncommitted audit changes or force-push. Attach any created PR.
- [ ] **Step 4 Report completed and remaining client scope.** Record actual commits/tests/migration/report/digest outcomes and the demo walkthrough. Continue with the role design's remaining delivery register: dates/scheduling, remaining notifications/real email, profile/dashboard/mark-sheet gaps, folder/prerequisite detail and client-authorized HRMS integration. Do not claim these remaining items or hosted deployment complete from feedback delivery alone.

## Coverage and self-review

Delivery history/migration: Task 1. Eligibility, one response, edits, disclosure and learner UI: Task 2. Scoped detail/aggregate reports, periods, closed-cutoff reconstruction and CSV: Task 3. Moderation, personal data and period digests: Task 4. All eight approved acceptance families, concurrency/privacy regressions, fresh review and main integration: Task 5. All shared role/scope types consume the first plan's named interfaces.
