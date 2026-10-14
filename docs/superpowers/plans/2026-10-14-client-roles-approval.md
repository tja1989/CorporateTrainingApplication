# Client roles and course approval implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver five real login roles, department-scoped course approval, HR publication/rollout and a verified migration preserving existing learning history.

**Architecture:** Central permission and scope helpers govern existing and new entry points. Approval state and content revision sit beside publication status; transactional workflow events and in-app notifications capture each decision. The existing enrollment engine remains the authority for assignment/completion history.

**Tech Stack:** Existing Node >=20, Next.js 15, React 19, TypeScript, Drizzle/PostgreSQL 16 with pgvector, Vitest and the isolated Playwright harness. No new runtime dependencies are required.

**Spec:** `docs/superpowers/specs/2026-10-14-client-roles-approval-design.md`, approved by the user on 14 October 2026.

## Global constraints

- **Instructor submits → Department Head approves or rejects with comments → HR/L&T Head publishes and rolls out. Super Admin can intervene with a recorded reason.**
- Keep `ADMIN` and `LEARNER` as compatible storage values; display them as **Super Admin / IT Admin** and **Employee**.
- New editors and imports expose exactly the five roles.
- Workspace switching only changes presentation; it cannot widen permissions.
- Super Admin retains mandatory TOTP. HR Head also requires TOTP because it accesses HR records and organization-wide training data.
- A legacy signed role claim must not override the current database role after an administrator changes a person's role.
- Department membership is explicit; a group name or job title is not an access grant.
- A Department Head without a department gets a useful empty state and zero scoped records.
- Do not reseed deployed data. Preserve history, identifiers, existing consent and shared-device gates.
- Use the existing xprtn layout, fields, buttons, tables/mobile rows, dialogs and dark theme. Keep keyboard access, 44px targets, responsive layouts and honest empty/error states.
- Main integration follows passing unit/type/build checks and a fresh independent review. Deployment is a separate step.

## Workspace and verification setup

Work in `/Users/USER/.codex/worktrees/welearn-rework/CorporateTrainingApplication`, branch `codex/client-requirements`, initially `83a8297`. The primary checkout is `/Users/USER/claude_tj/CorporateTrainingApplication` on main and is available for the user's Claude/Opus UI audit. Never reset it or overwrite uncommitted audit changes.

Use a new isolated local database `welearn_client_requirements_20261014` on the existing loopback PostgreSQL port 55438. Copy the clean fictional client baseline into it, then migrate that copy. Do not run new fixtures against `welearn_client_20261014` or Railway. Private provider-free environment files stay in ignored `.artifacts/client-requirements-20261014/` with mode 600; log only database host/name and check results. Run the feature app on port 3102 and its local HTTPS proxy on 3444 so the existing demo remains available.

Use the existing `npm test`, `npm run typecheck`, `npm run build` and `npm run test:e2e -- ...` runners. Browser automation fixtures require loopback `welearn_*` databases. Extend that existing guard rather than inventing a second uncontrolled fixture mechanism. Save evidence in `.artifacts/client-requirements-20261014/`.

## Review focus

1. Old signed ADMIN/MANAGER cookies after database role changes must lose revoked permissions immediately — Task 1.
2. People with no department, overlapping groups or unrelated manager relationships must not receive another department's records — Tasks 2 and 4.
3. Direct calls to old exported publishing/curriculum actions must not bypass the new approval flow — Task 3.
4. Two approvers or an author/approver racing the same revision must produce one valid decision and consistent notifications — Task 3.
5. Migration reruns, legacy published courses and certificate-renewal history must survive the extension unchanged — Tasks 2 and 5.

---

## Task 1 Central roles and authenticated access

**Files**
- Create `lib/auth/roles.ts`, `lib/auth/permissions.ts`, `tests/client-roles.test.ts`, `tests/client-session-access.test.ts`.
- Modify `lib/db/schema.ts` (five role types plus nullable user department ID), `lib/auth/session.ts`, `lib/auth/guard.ts`, `lib/auth/login.ts`, `lib/workspace-inputs.ts`, `lib/hr/scope.ts`, `lib/report-options.ts`.
- Update existing role fixtures in `tests/workspace-security.test.ts`, `tests/auth-guard.test.ts` and `tests/report-api-permissions.test.ts` while retaining their privacy/reset denial assertions and adding legacy alias coverage.
- Modify `app/(auth)/actions.ts`, `app/(auth)/login/mfa/page.tsx`, `app/(auth)/login/mfa-setup/page.tsx`, `app/(auth)/login/mfa-setup/setup-form.tsx`, `app/page.tsx`.

**Interfaces**
```ts
export type Role = "ADMIN" | "DEPARTMENT_HEAD" | "HR_HEAD" | "INSTRUCTOR" | "LEARNER";
export type StoredRole = Role | "MANAGER";
export type Workspace = "admin" | "department" | "hr" | "instructor" | "learner";
export type Actor = { id: string; role: Role; departmentId: string | null };
export function canonicalRole(raw: string): Role | null;
export function needsMfa(role: Role): boolean;
export function defaultWorkspace(role: Role): Workspace;
export function workspaceHome(workspace: Workspace): string;
export function allowedWorkspaces(role: Role): Workspace[];
export function policyAudience(role: Role): "all" | "managers";
export function canResetPerson(actor: Actor, target: Actor): boolean;
export type Permission = "identity.manage" | "course.author" | "course.approve" |
  "course.publish" | "course.override" | "course.rollout" | "reports.read" |
  "hr.manage" | "assessment.review" | "feedback.read" | "feedback.moderate";
export function hasPermission(role: Role, permission: Permission): boolean;
export async function requirePermission(permission: Permission): Promise<CurrentUser>;
```

- [ ] **Step 1 Write failing role and credential tests.** Use literal expected permissions; keep the existing real JWT signing/verification path in session tests and mock only Next's cookie store/DB boundary.
```ts
it("an instructor cannot publish or read manager-only policy", () => {
  expect(hasPermission("INSTRUCTOR", "course.publish")).toBe(false);
  expect(policyAudience("INSTRUCTOR")).toBe("all");
});
it("legacy manager maps to department head without becoming HR", () => {
  expect(canonicalRole("MANAGER")).toBe("DEPARTMENT_HEAD");
  expect(canonicalRole("UNKNOWN")).toBeNull();
  expect(defaultWorkspace("DEPARTMENT_HEAD")).toBe("department");
});
it("HR must complete MFA and cannot reset privileged peers", () => {
  expect(needsMfa("HR_HEAD")).toBe(true);
  expect(canResetPerson({ id:"hr", role:"HR_HEAD", departmentId:null },
    { id:"admin", role:"ADMIN", departmentId:null })).toBe(false);
});
```
Add literal cases for all five roles, unauthenticated/erased users, stale ADMIN claims against a current LEARNER row, HR activation/MFA, shared session expiry and legacy `manager` workspace. Run `npm test -- tests/client-roles.test.ts tests/client-session-access.test.ts` and record the intended failing assertions.

- [ ] **Step 2 Implement central role definitions and permissions.** Use this canonicalization and MFA boundary:
```ts
const roles = new Set<string>(["ADMIN", "DEPARTMENT_HEAD", "HR_HEAD", "INSTRUCTOR", "LEARNER"]);
export function canonicalRole(raw: string): Role | null {
  if (raw === "MANAGER") return "DEPARTMENT_HEAD";
  return roles.has(raw) ? raw as Role : null;
}
export function needsMfa(role: Role) { return role === "ADMIN" || role === "HR_HEAD"; }
export function policyAudience(role: Role): "all" | "managers" {
  return ["ADMIN", "HR_HEAD", "DEPARTMENT_HEAD"].includes(role) ? "managers" : "all";
}
```
Role homes are `/admin`, `/department`, `/hr`, `/instructor`, `/home`. Each privileged role may also use `learner`; Employee may only use `learner`. Define literal permission sets matching the approved role table. Super Admin has all listed permissions; HR has author/publish/rollout/reports/HR/review/feedback but no identity-role escalation or override; Department Head has approve/rollout/reports/feedback; Instructor has author/reports/feedback; Employee has no listed management permissions.

- [ ] **Step 3 Apply the definitions at authentication boundaries.** In `currentUser`, canonicalize the current database role, reject unknown roles and derive a permitted effective workspace even when a legacy session contains `manager`. Never trust `session.role` to authorize an operation. `apiUser` and `requireUser` use `needsMfa`; login, activation, MFA return and privacy acknowledgment use the role home helpers. Generalize legacy `requireRole` argument normalization so existing ADMIN/MANAGER callers remain correct until their per-permission conversions in Task 4. `switchWorkspace` reloads the current user and rejects a requested workspace outside `allowedWorkspaces`. `canResetPerson` permits ADMIN all targets, HR only LEARNER targets and Department Head only same-department LEARNER targets. Replace the historical broad non-LEARNER policy audience with `policyAudience`.

- [ ] **Step 4 Extend five-role validation and run checks.** People editors/imports accept only the five values, while the compatibility reader accepts MANAGER. Include role labels in `roles.ts`; all displays use them. Run the two new files, `tests/auth-guard.test.ts`, `tests/mfa-setup.test.ts`, `tests/hr-history-access.test.ts`, then `npm test` and `npm run typecheck`. Commit `feat: centralize five-role authentication and access` with explicit paths.

## Task 2 Departments and history-preserving migration

**Files**
- Create `migrations/20261014_client_roles_approval.sql`, `lib/org/departments.ts`, `lib/auth/scope.ts`, `scripts/qa-client-migration.ts`, `tests/client-scope.test.ts`.
- Modify `lib/db/schema.ts`, `scripts/deploy-init.ts`, `scripts/db-extras.sql`, `migrations/README.md`, `app/(workspace)/admin/people/actions.ts`, `app/(workspace)/admin/people/page.tsx`, `app/(workspace)/admin/people/people-editor.tsx`.

**Interfaces**
```ts
export type TrainingScope = { userIds?: string[]; courseIds?: string[] };
export async function trainingScope(actor: Actor): Promise<TrainingScope>;
export async function createDepartment(actor: Actor, name: string): Promise<string>;
export async function renameDepartment(actor: Actor, id: string, name: string): Promise<void>;
export async function assignDepartment(actor: Actor, userId: string, departmentId: string | null): Promise<void>;
```
Undefined user scope means all people only for ADMIN/HR. Empty arrays always mean no records. Department Head reports use department employee IDs across their assigned courses, including common/legacy courses owned by another department; do not filter those reports to course ownership. Approval queues separately filter the course's department. Instructor scope contains only assigned/delivered course IDs and enrolled people in those courses; unrelated employee identity/account fields are not report columns for Instructor.

- [ ] **Step 1 Write scope tests and the migration probe.** Catch missing departments and group-name escalation with actual permission/scope behavior. The isolated probe uses `pg.Client`, enforces the existing loopback QA guard, applies the SQL twice and compares stable ordered hashes for users' pre-existing identity fields, enrollments, lesson progress, attempts, completions and certificates. Expected changes are only MANAGER→DEPARTMENT_HEAD and new department fields/tables; all existing learning columns must hash identically.
```ts
it("a department head without membership sees no records", async () => {
  expect(await trainingScope({id:"head", role:"DEPARTMENT_HEAD", departmentId:null}))
    .toEqual({userIds:[], courseIds:[]});
});
```
Use a real isolated DB for populated scope fixtures: two departments, overlapping groups, one cross-department manager relationship, an unassigned employee and an instructor with zero owned courses. Run the new scope tests/probe and capture the missing-feature failures.

- [ ] **Step 2 Add schema and repeatable SQL.** Add `departments(id,name,created_at)`, nullable `users.department_id` and course department/instructor IDs plus revision/approval fields. Define workflow event storage for Task 3 with unique request ID. The role data conversion uses:
```sql
INSERT INTO departments (id, name)
SELECT 'legacy-dept-' || id, name || ' team' FROM users WHERE role = 'MANAGER'
ON CONFLICT (id) DO NOTHING;
UPDATE users SET department_id = 'legacy-dept-' || id
WHERE role = 'MANAGER' AND department_id IS NULL;
UPDATE users u SET department_id = 'legacy-dept-' || m.id
FROM users m WHERE u.manager_id = m.id AND m.role = 'MANAGER' AND u.department_id IS NULL;
UPDATE users SET role = 'DEPARTMENT_HEAD' WHERE role = 'MANAGER';
```
Use `ADD COLUMN IF NOT EXISTS` and repeatable table/index creation. Mark only pre-existing PUBLISHED courses without a recorded workflow decision as LEGACY_PUBLISHED; do not reclassify later approved publications on every startup. New courses default to DRAFT revision 1. Index department/instructor lookups and event course/time/request ID. Do not use table drops or a destructive seed.

- [ ] **Step 3 Implement the department helpers and deployment hook.** Restrict create/rename/membership actions to `identity.manage`, reject blank names and nonexistent departments, and reevaluate affected enrollment rules after a membership update without resetting progress. After Drizzle schema creation, deploy-init runs the idempotent migration as a complete SQL transaction before reporting ready. Fresh fictional seeds may use five-role departments; existing deployed identities are not promoted to HR or Instructor.

- [ ] **Step 4 Verify preservation and commit.** Run `scripts/qa-client-migration.ts` through the provider-free QA helper against the new isolated database, then new scope tests, existing rule/path/completion tests, `npm test`, `npm run typecheck`. Document migration ordering and compatible rollback without dropping added fields. Commit `feat: add department scope and compatible role migration`.

## Task 3 Audited approval state machine and curriculum gates

**Files**
- Create `lib/courses/approval-policy.ts`, `lib/courses/workflow.ts`, `lib/courses/ownership.ts`, `tests/course-approval.test.ts`, `tests/course-workflow-actions.test.ts`, `e2e/client-approval.e2e.ts`.
- Modify `app/(workspace)/admin/courses/actions.ts`, `lib/notify.ts`, `components/inbox-list.tsx`.

**Interfaces**
```ts
export type ApprovalState = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "LEGACY_PUBLISHED";
export type CourseAction = "submit" | "withdraw" | "approve" | "reject" | "publish" | "revise" | "archive" | "override";
export type WorkflowInput = { courseId:string; action:CourseAction; revision:number; requestId:string; comment:string; overrideState?:ApprovalState; overridePublication?:"DRAFT"|"PUBLISHED"|"ARCHIVED" };
export type ApprovalContext = { actor:Actor; state:ApprovalState; publication:"DRAFT"|"PUBLISHED"|"ARCHIVED"; revision:number; submittedRevision:number|null; approvedRevision:number|null; submittedBy:string|null; createdBy:string|null; instructorId:string|null; departmentId:string|null; instructorActive:boolean; lessonCount:number; approverCount:number };
export type Decision = { ok:true; state:ApprovalState; publication:"DRAFT"|"PUBLISHED"|"ARCHIVED" } | { ok:false; error:string };
export function decideCourseAction(context:ApprovalContext, input:WorkflowInput): Decision;
export async function transitionCourse(actor:Actor, input:WorkflowInput): Promise<void>;
export async function mutateDraftCourse<T>(actor:Actor, courseId:string, run:(tx:LearningTransaction)=>Promise<T>): Promise<T>;
```
`LearningTransaction` is the existing type in `lib/lms/learning-cycle.ts`. `mutateDraftCourse` locks, checks ownership/editability and increments revision after the mutation; every old curriculum/settings mutation must use it.

- [ ] **Step 1 Write literal state/authorization and concurrency tests.** Use real `decideCourseAction` expectations and a real isolated DB for write/lock/notification behavior.
```ts
function submittedContext(changes:Partial<ApprovalContext> = {}): ApprovalContext {
  return {actor:{id:"head",role:"DEPARTMENT_HEAD",departmentId:"a"}, state:"SUBMITTED",
    publication:"DRAFT", revision:2, submittedRevision:2, approvedRevision:null,
    submittedBy:"trainer",createdBy:"trainer",instructorId:"trainer",departmentId:"a",
    instructorActive:true,lessonCount:2,approverCount:1,...changes};
}
function approvedContext(changes:Partial<ApprovalContext> = {}): ApprovalContext {
  return submittedContext({actor:{id:"hr",role:"HR_HEAD",departmentId:null},
    state:"APPROVED",approvedRevision:2,...changes});
}
it("a different department cannot approve", () => {
  expect(decideCourseAction(submittedContext({actor:{id:"other",role:"DEPARTMENT_HEAD",departmentId:"b"}}),
    {courseId:"c",action:"approve",revision:2,requestId:"r",comment:""})).toEqual({ok:false,error:"This course is outside your department."});
});
it("editing an approved revision prevents publishing it", () => {
  expect(decideCourseAction(approvedContext({revision:3,approvedRevision:2}),
    {courseId:"c",action:"publish",revision:3,requestId:"r",comment:""}).ok).toBe(false);
});
```
Keep these helpers test-local. Add self-approval, no approver/instructor/lessons, whitespace rejection/override reason, published edit, old direct `setCourseStatusAction(...,"PUBLISHED")`, spoofed instructor ID, duplicate request, approve/reject races and notification rollback. Run the new tests and keep their red results.

- [ ] **Step 2 Implement decision rules.** Require matching input/current revision for every transition. Submit requires assigned active instructor, department, nonempty curriculum and department approver; author roles may withdraw. Approve/reject requires same-department DEPARTMENT_HEAD and a different actor from creator/submitting author. Publish requires HR_HEAD and approvedRevision===revision. Edit of approved/rejected unpublished content invalidates approval; SUBMITTED/PUBLISHED are not editable. Revise published content requires author permission and returns publication/approval to DRAFT. Archive requires HR_HEAD or ADMIN. Override requires ADMIN plus a nonblank reason and valid explicit target states. No ordinary ADMIN publish bypass is allowed.

- [ ] **Step 3 Implement transactional persistence.** Lock using the same `curriculum:${courseId}` advisory-lock key as module moves, then read current course/ownership/revision inside the transaction. The event's request ID is unique; a replay returns the committed result only when actor, course and action match. Persist submitted/approved revisions and actor IDs, timestamp the decision and append an event. Insert in-app notifications in the same transaction through `notify(...,{connection:tx,afterCommit})`; flush deferred external work after commit. Submission notifies scoped Department Heads; rejection notifies instructor; approval notifies instructor/HR; publication notifies instructor/department. All notification links resolve to permitted detail pages.

- [ ] **Step 4 Protect every existing mutation.** Replace direct status writes with `transitionCourse`; pass draft settings, modules, lessons, oral settings, ingestion retry and move operations through `mutateDraftCourse`. Verify module/lesson/video belong to the authorized course before changing them. All callback writes use the supplied transaction; remove nested independent transactions from module moves to prevent an outer/inner lock deadlock. Run external validation before the transaction and ingestion/drain after commit. Submission requires referenced video ingestions READY and quiz banks sufficient for their configured question count. A pending/background ingestion must not mutate approved content; bind its job to the authorized draft revision and reject stale writes. The course editor supplies stable request IDs and revision tokens; failures return `ActionResult.error` with retained input.

- [ ] **Step 5 Verify and commit.** Run new policy/action tests, the two-user race probe, existing lesson/outline/video tests and `npm test`/typecheck. Commit `feat: enforce audited department course approval`.

## Task 4 Five workspaces rollout and scoped reporting

**Files**
- Create `app/(workspace)/hr/page.tsx`, `app/(workspace)/hr/inbox/page.tsx`, `app/(workspace)/hr/rollout/page.tsx`, `app/(workspace)/hr/rollout/actions.ts`.
- Create `app/(workspace)/department/page.tsx`, `app/(workspace)/department/inbox/page.tsx`, `app/(workspace)/department/approvals/[courseId]/page.tsx`, `app/(workspace)/department/approvals/actions.ts`.
- Create `app/(workspace)/instructor/page.tsx`, `app/(workspace)/instructor/inbox/page.tsx`, `app/(workspace)/instructor/courses/[courseId]/page.tsx`.
- Create `components/course-workflow.tsx`, `components/course-editor.tsx`, `lib/courses/rollout.ts`, `tests/client-rollout.test.ts`, `e2e/client-roles.e2e.ts`.
- Modify `components/shell.tsx`, `lib/navigation.ts`, `app/(workspace)/layout.tsx`, `app/(workspace)/admin/courses/page.tsx`, `app/(workspace)/admin/courses/[courseId]/page.tsx`, `app/(workspace)/team/page.tsx`, `app/(workspace)/team/[userId]/page.tsx`, `app/(workspace)/team/actions.ts`, `app/(workspace)/team/reports/page.tsx`.
- Modify `app/(workspace)/admin/reports/page.tsx`, `app/(workspace)/admin/reviews/page.tsx`, `app/(workspace)/admin/reviews/actions.ts`, `app/(workspace)/admin/corpus/page.tsx`, `app/(workspace)/admin/corpus/actions.ts`, all `app/(workspace)/admin/tickets/**` pages/actions.
- Modify `app/api/reports/ask/route.ts`, `app/api/reports/[reportId]/csv/route.ts`, `app/api/certificates/[certId]/route.ts`, `lib/reports.ts`, `lib/report-options.ts`, `lib/auth/login.ts`, `scripts/seed.ts`, `e2e/support.ts`.

**Interfaces**
```ts
export type RolloutInput = { target:{type:"course"|"path";id:string}; audience:{type:"employee"|"department"|"group";id:string}; dueDays:number };
export async function rolloutTraining(actor:Actor,input:RolloutInput): Promise<{enrolled:number;alreadyAssigned:number}>;
```
Add server-controlled `courseIds?:string[]` to existing `ReportFilters`; intersect it with user/course-title filters, never let a form/model overwrite it. `trainingScope` from Task 2 is injected at every report and CSV entry point.

- [ ] **Step 1 Write rollout and workspace red tests.** Test group members in two departments: Department Head cannot enroll the other department; HR can. Reject unpublished/unapproved targets, inactive people and paths containing unavailable courses. Verify duplicate enrollment preserves due date/history and reports exclude empty scopes. Extend the existing `Person` fixture type with five roles/department ID; HR QA fixtures use the test-only TOTP seed, never a real account's secret.
```ts
it("an instructor cannot roll out training", async () => {
  const instructorActor:Actor = {id:"trainer",role:"INSTRUCTOR",departmentId:"a"};
  await expect(rolloutTraining(instructorActor, {target:{type:"course",id:"approved"},
    audience:{type:"department",id:"a"},dueDays:14})).rejects.toThrow("Not authorized");
});
```

- [ ] **Step 2 Implement scoped rollout and reports.** Resolve the audience on the server, enforce actor scope and published approval state, validate dueDays 1–3650, compute dates through existing timezone helpers and call `enrollUser` with authenticated actor provenance. Notify each newly enrolled employee; repeated targets do not repeat enrollments. Expose attempted/already-assigned counts without private unrelated names. All six reports, Ask Reports plans and CSV exports inject user/course scope. Instructor reports remove role/email/account and unrelated HR columns; certificate reads permit only own/scoped-authorized employee records.

- [ ] **Step 3 Build workspaces using the existing component contract.** HR overview has approved-to-publish queue, catalog, rollout, reports and authorized HR/review links. Department overview has pending approvals, employees and reports. Instructor overview has assigned draft/submission courses. Share the course editor between authorized ADMIN/HR/Instructor wrappers; filter ownership before rendering content. Department approval detail is read-only curriculum plus decision forms. Render event timeline/comment, revision, owner and next allowed action. Preserve existing learner routes and “View as learner”; return action uses the actor's canonical workspace. Each new workspace has its own inbox and permission-derived navigation.

- [ ] **Step 4 Convert shared operational routes to permissions.** HR policy/ticket/review pages use `hr.manage`/`assessment.review`, identity/DSR/integrity administration stays Super Admin. Account reset uses `canResetPerson` before writes. Department Head people/report reads use department membership; historical direct-report-only helpers remain explicit. Every exported action, not just its page, checks permission and relevant object scope. New demo seeds are fictional and five-role complete; existing production accounts require explicit provisioning rather than automatic promotion.

- [ ] **Step 5 Run the complete browser chain.** In `e2e/client-approval.e2e.ts`, use separate browser contexts for Instructor, Department Head, HR and Employee; create prerequisite people/departments only through fixture setup. Course creation, submission, rejection, resubmission, approval, publication, rollout and enrollment observation all happen through UI controls. Assert persisted states after refresh, rejection comment, one event/notification per transition, role inbox destinations and denied unrelated detail/export/action calls. Run desktop/mobile Chromium, then the @core chain in Firefox/WebKit.

- [ ] **Step 6 Verify and commit.** Run both new browser files plus affected auth/manager/admin cross-role regressions. Run `npm test`, `npm run typecheck`, `npm run build`; commit `feat: add five-role workspaces and approved training rollout`.

## Task 5 Qualification and integration into main

**Files**
- Modify `docs/CLIENT_DEMO.md`, `README.md`, `docs/qa/PROGRESS.md`, `migrations/README.md`.
- Create `docs/qa/CLIENT_ROLES_APPROVAL.md`, extend `e2e/client-roles.e2e.ts` and `e2e/client-approval.e2e.ts`.

- [ ] **Step 1 Close each acceptance case.** Check role changes on existing sessions, MFA setup/verification, unknown legacy roles, no-department and empty-team access, path locks, result/certificate access, approval races, archived/legacy course behavior, repeat migrations and course renewal. Save actual outcome/build commit beside browser traces and migration checks. Mark unavailable external/provider/physical-device checks explicitly unverified.
- [ ] **Step 2 Run release checks on the final tree.** Run `npm test`, `npm run typecheck`, `npm run build` and the affected cross-engine workflow suites with no retries; run unchanged report privacy/auth/HR history/lesson completion regression cases. Record any failure rather than overwriting evidence or weakening assertions.
- [ ] **Step 3 Obtain independent review.** A fresh reviewer checks central permissions, stale-session revocation, transactional decisions, migration preservation, direct action/API guards and scope intersection. Address actionable findings and rerun affected tests. The user's Opus visual audit is complementary; its existence is not evidence of backend review.
- [ ] **Step 4 Integrate with the user's main changes.** Fetch `origin/main`, inspect root status, merge main into the feature branch and resolve conflicts preserving both audited UX changes and functional checks. Retest the actual combined result. Integrate/push to main using the user's existing main-integration authorization; never force-push or discard Claude's uncommitted work. If a PR is used, attach it to this chat.
- [ ] **Step 5 Report the boundary clearly.** Provide main commit, role credentials/provisioning requirements, approval walkthrough, passing evidence and still-open client gaps. Do not claim deployment from a merge: Railway CI billing and provider key access must be resolved or separately approved at deployment time. Begin the approved feedback plan from this integrated role/scope foundation.

## Coverage and self-review

Role/auth/reset/policy boundaries: Task 1. Department creation, migration and scopes: Task 2. All eight workflow transitions, revision guards, ownership, audit and notification atomicity: Task 3. Five journeys, role inboxes, curriculum, rollout, reports/export/direct actions: Task 4. Existing-data compatibility, all required acceptance evidence, review and main integration: Task 5. Feedback consumes the exact Actor/Role/TrainingScope/workflow ownership contracts above.
