# Client login roles and course approval design

## Purpose and approved workflow

Implement the client checklist in `LMS  demo V 1.docx`, pages 1 and 3, beginning with five actual permission roles and Department Head approval. The user approved this sequence on 14 October 2026:

**Instructor submits → Department Head approves or rejects with comments → HR/L&T Head publishes and rolls out. Super Admin can intervene with a recorded reason.**

The next subsystem is course and instructor feedback, specified in `2026-10-14-client-feedback-design.md`. Other client gaps remain in the delivery register below; they are part of the requested work, not accepted omissions.

## Starting point and branch ownership

- Main contains the merged xprtn rework, the deployment record, and branding cleanup at `1c87730`.
- The previous `codex/welearn-rework` tree matched main before the new maintenance commits. Its historical commits remain available, and its checkout has been reconciled to main without removing local demo databases or artifacts.
- Active product surfaces and development defaults are organization-neutral xprtn. Historical client specifications and qualification records remain evidence, not current UI authority. Existing session/theme cookie names remain compatible identifiers; no credential or learning-data migration is needed for branding cleanup.
- The user stopped the previous Claude session and will restart Claude/Opus on main for a UI/UX audit after cleanup. Feature implementation uses the existing isolated checkout and a new `codex/client-requirements` branch from current main.
- Implementation owns authorization, schema/migrations, course workflow, new functional pages and domain tests. The UI audit can inspect these and refine design findings. Fetch main before integration; preserve and reconcile concurrent changes rather than resetting either checkout.

## Implementation approach

Use the existing Next.js, Drizzle/PostgreSQL, employee-ID authentication, form components and notification inbox. Centralize permissions and data scope rather than adding role conditions independently to every page. Add an explicit approval state machine beside the current publication status so existing published courses continue working.

Alternative 1, relabel the three current roles, would be quicker but cannot provide separate instructor, Department Head and HR responsibilities. Alternative 2, a configurable permission/workflow builder, adds complexity the client's fixed five-role process does not need. Fixed roles with shared permission helpers and an audited workflow are the selected design.

## Five roles and permissions

Keep `ADMIN` and `LEARNER` as compatible storage values; display them as **Super Admin / IT Admin** and **Employee**. Introduce `DEPARTMENT_HEAD`, `HR_HEAD` and `INSTRUCTOR`. Accept historical `MANAGER` values as a Department Head alias while migrating stored values. New editors and imports expose exactly the five roles.

| Role | Own learning | Course authoring | Approval and rollout | People and reporting |
|---|---|---|---|---|
| Super Admin / IT Admin | Yes | All courses | Audited intervention with a mandatory reason; no silent bypass | Identity/roles/departments, all reports, existing operational queues |
| Department Head | Yes | Read submitted department content; cannot rewrite an instructor's submission | Approve/reject submissions in own department; assign published training to department employees | Own department employees, assignments and reports |
| HR Head / L&T Head | Yes | Manage training catalog and instructor assignments | Publish approved courses, archive courses, roll out approved published courses | Organization training reports, HR policy/tickets and assessment review; no unrestricted role escalation |
| Instructor / Trainer | Yes | Create/edit own assigned draft courses and curriculum | Submit for approval; view decisions; cannot approve/publish own course | Assigned course engagement/results and own instructor feedback summary; no unrelated HR or employee-account access |
| Employee | Yes | None | Receives enrollments and notifications | Own progress, results, certificates and feedback |

All five roles use the same sign-in and activation flow. Role selection is not a login control. The database role and authorized scope govern pages, API routes, server actions, exports and direct URLs. Workspace switching only changes presentation; it cannot widen permissions.

HR policy retrieval remains a separate permission boundary: Employee and Instructor receive the all-employee audience; Department Head, HR Head and Super Admin may receive manager-audience documents. A new non-Employee role does not automatically grant manager-policy access.

Super Admin retains mandatory TOTP. HR Head also requires TOTP because it accesses HR records and organization-wide training data. Department Head and Instructor use the existing employee-ID/password gates and privacy acknowledgment. Existing shared-device expiry and HR-history reauthentication remain enforced. A legacy signed role claim must not override the current database role after an administrator changes a person's role.

Password reset permissions are explicit: Super Admin for all accounts; HR Head and Department Head for employees in their authorized scope only. Neither may reset privileged peers or Super Admin credentials. Instructor has no reset capability.

## Organization scope

Add a dedicated `departments` table and nullable `users.departmentId`. Preserve existing country/region/store hierarchy, groups and manager relationships. Department membership is explicit; a group name or job title is not an access grant.

For existing manager/learner relationships, an idempotent migration creates one department per existing manager and links that manager and their current direct reports. Unassigned legacy employees remain unassigned, visible to Super Admin/HR but not to arbitrary Department Heads. Administrators can create/rename departments and assign people to them. A Department Head without a department gets a useful empty state and zero scoped records.

Preserve the current manager/direct-report relationship for account-help and existing team workflows. Department reports use department membership; direct-report-only endpoints cannot become organization-wide accidentally. An empty scope must produce empty results and exports.

## Course ownership and state

Add nullable `courses.departmentId` and `courses.instructorId`, `approvalState`, `contentRevision`, `submittedRevision`, `approvedRevision`, and submission/decision timestamps. Publication status remains `DRAFT`, `PUBLISHED` or `ARCHIVED`. Approval states are `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED` and `LEGACY_PUBLISHED`.

Existing published courses are marked `LEGACY_PUBLISHED` during migration and remain accessible. Historical enrollments, completion records, attempts and certificates retain their identifiers and values. New courses require a department and an active assigned instructor before submission. Instructor ownership is not inferred from a client-supplied creator ID.

An append-only `course_workflow_events` table records course, actor, action, previous/next approval/publication state, content revision, reason/comment and timestamp. Include a unique request identifier to make duplicate form submissions idempotent.

### State transitions

1. **Create/edit draft:** assigned Instructor, HR Head or Super Admin. A curriculum/settings change increments the content revision. An edit to rejected or approved unpublished content returns approval to `DRAFT` and invalidates the prior decision. Submitted content is read-only until withdrawn or decided.
2. **Submit:** author submits a valid nonempty curriculum with department/instructor, capturing its revision. Submission records an event and notifies the department's Department Head accounts. Missing approvers produces a visible validation error rather than an unreviewable submission.
3. **Approve:** Department Head in the course's department approves the unchanged submitted revision. A person who authored/submitted the course cannot approve it. Approval comments are optional; the decision/event is always recorded.
4. **Reject:** scoped Department Head records a mandatory nonblank reason. The instructor can read the comment, revise the course and resubmit.
5. **Publish:** HR Head publishes only the revision actually approved. A stale approval or concurrent curriculum update is rejected atomically. Publishing records the actor and notifies the instructor and approving department.
6. **Roll out:** HR Head selects an individual, department or group, a published approved/legacy course or learning path, and an assignment due date. The existing enrollment engine preserves its duplicate/history rules. Department Head may roll out existing published content to their own department. An approval decision by itself never enrolls employees.
7. **Super Admin intervention:** a dedicated action, not a hidden fallback in normal publish, requires a nonblank reason and records the overridden transition and actor. It cannot overwrite another decision's audit history.
8. **Archive:** HR Head or Super Admin may archive with an event; existing progress/results remain stored. Re-publication requires a valid approved revision or an explicit audited intervention.

Published curriculum is not edited in place during this first release. The author moves it to draft for revision, with an explicit notice that it temporarily leaves the catalog; prior history survives. Versioned parallel course delivery is a later design decision, not implicit functionality.

The server takes a per-course transactional lock and validates current state, revision, role and department inside the transaction. Decision, state change and in-app notification records commit together. A failed transition retains the form values and explains what changed. External email, once implemented, is sent after commit.

## Workspaces and user journeys

- Super Admin keeps `/admin`, People and operational queues; role labels and navigation use centralized permission definitions.
- HR Head gets a training/HR workspace with catalog, approved-to-publish queue, rollout, reports, policy library, tickets and assessment reviews.
- Department Head gets a department workspace with pending approvals, decision history, employees, assignments and department reports.
- Instructor gets owned/assigned courses, draft authoring, submission status/decision comments and course reports.
- Employee keeps `/home`, `/learn`, lessons, assessments, profile, certificates and inbox.
- Each course editor shows the assigned department/instructor, current workflow state, latest decision/comment and the next action the signed-in user is allowed to take.
- Approval detail contains the submitted curriculum and version, author, department and submission time. Approve/reject controls have clear labels and retain rejection text on validation/concurrency errors.
- Inbox destinations route to the correct role workspace. Every deep link rechecks access; visibility is not authorization.

Use the existing xprtn layout, fields, buttons, tables/mobile rows, dialogs and dark theme. Keep keyboard access, 44px targets, responsive layouts and honest empty/error states. No fabricated instructor ratings or course statistics.

## Data migration and release

Provide additive, idempotent SQL and matching schema types. Migrate `MANAGER` role values only after compatible readers exist. Preserve legacy signed cookies by canonicalizing their role at the server's database boundary and deriving the permitted workspace from that role.

Validate migration twice against an isolated copy containing pre-existing users, enrollments, attempts, completions and certificates; compare counts and hashes of all pre-existing learning columns. Do not reseed deployed data. Rollback retains additive columns/tables and uses compatible role mappings; do not drop data to roll back.

Create fictional demo accounts for each role in the isolated test seed, with real department ownership and instructor assignments. Existing production users are not silently promoted. A production provisioning step must identify the intended HR/Department Head/Instructor accounts before changing their access.

Main integration follows passing unit/type/build checks and a fresh independent review. Deployment is a separate step; the hosted GitHub CI billing lock and provider credential blockers remain recorded. No further CI bypass is inferred from earlier single-deployment approvals.

## Required acceptance evidence

- Five roles log in, activate and land in permitted workspaces; all can enter their own learning workspace and return correctly.
- Direct page/API/action/CSV requests by an Instructor or unrelated Department Head cannot disclose other department records or perform forbidden transitions.
- Full real-backend browser chain: Instructor creates/submits → Department Head rejects with a comment → Instructor revises/resubmits → Department Head approves → HR Head publishes/rolls out → Employee receives enrollment and starts learning.
- Self-approval, empty rejection/override reasons, stale revisions and double-clicked decisions are rejected or idempotent, with one committed decision/event.
- Removing/changing a person's role or department takes effect on the next request; old signed claims cannot preserve old access.
- Existing Admin MFA, HR consent/history, account reset, prerequisite, completion/certificate and report-scope tests remain green.
- Test empty departments, unassigned employees, inactive instructors and missing department approvers.
- Desktop/mobile browser checks cover the new forms, retained input, notifications, dark mode and keyboard operation. Opus UI review findings are tracked separately from functional verification.

## Remaining client delivery register

After role/approval and feedback delivery, continue through these gaps from the client checklist:

1. Course start/end dates and scheduled availability, visible enrollment date, explicit course prerequisites and folder organization.
2. Full targeted notification composer, approval/start/end/feedback/result/certificate events, real email transport and verified scheduled delivery.
3. Employee profile image/settings, future course planning, department/group dashboards and individual assessment mark sheets.
4. HRMS employee synchronization. The client must supply system identity, API/export format and authorized integration access; CSV import is not synchronization. Define field ownership, update/deactivation behavior and reconciliation before connecting real HRMS data.
5. Resolve the meaning of leadership status and whether video quizzes must interrupt playback; existing standalone transcript-based quizzes must not be presented as either feature.

Acceptance of this design covers the first subsystem and its interfaces with feedback. The implementation plan will make the executable task sequence and validation commands explicit.
