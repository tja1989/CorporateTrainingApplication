# Client roles and course approval qualification

Implementation: `05ea9fa` plus the final qualification changes. This is local qualification, not a Railway deployment. Main integration and independent review are recorded below when completed.

## Implemented contract

Five sign-in roles: Super Admin / IT Admin, Department Head, HR Head / L&T Head, Instructor / Trainer and Employee. Existing MANAGER accounts migrate to Department Head with their direct reports in a department. Existing published courses remain available as legacy publications. No deployed identity is automatically promoted to HR or Instructor.

Instructor submits a ready revision; a different Department Head in that course's department approves or rejects with a comment; HR publishes and rolls out. Super Admin interventions require a recorded reason. Submitted/published curriculum is locked. Editing an approved draft invalidates its decision. Events and in-app notifications commit together. Duplicate requests, competing decisions and stale revision tokens are guarded.

HR and Super Admin require MFA. Database roles and department membership are authoritative on every request. Account resets revoke existing sessions. Department reports include their employees' shared courses; Instructor reports include only assigned course activity and omit account/unrelated HR fields. Automatic enrollment rules cannot create unpublished assignments.

## Evidence

- 247 unit tests, type check and production build passed.
- 24 role/approval browser cases passed across desktop/mobile Chromium, Firefox and WebKit. Separate contexts executed creation, rejection, resubmission, approval, publication, rollout, enrollment and inbox links. An unrelated Instructor's replayed edit action was rejected.
- 56 existing desktop/mobile workflow cases passed; the two transcript recovery cases passed after updating the fixture to first assert invalid-caption rejection and then recover an actual failed vendor job. Failed traces are retained.
- Three additional desktop cases passed for actual UI role changes on signed sessions, HR MFA setup, reset revocation, missing departments and unknown imported roles. Final cross-engine totals are recorded after the release run.
- The SQL migration was applied twice with stable hashes for seven identity/content/learning tables. Real populated scope fixtures reject overlapping groups and cross-department manager relationships.
- Real database probes verify a single concurrent approval/rejection winner, notification rollback, duplicate request replay, stale/background video write rejection, question-bank revision protection, rollout deduplication and weekly Department Head digest scope.
- A fresh isolated fictional seed has 32 people across five roles, all five lesson types and ready video ingestion. Repeat deployment initialization preserves approved content and skips reseeding.

Evidence lives in the feature checkout under `.artifacts/client-requirements-20261014/` and the ignored plan workspace. Provider keys are disabled in local qualification; test-only credentials and authenticators are used.

## Demo and provisioning

Fresh empty DEMO_MODE seed only (password `demo1234`):

| Login role | Employee ID | Name |
|---|---|---|
| Super Admin / IT Admin | AE90001 | Amina Al Mansouri |
| HR Head / L&T Head | AE90002 | Leena Varghese |
| Department Head | AE20001 | Joseph Mathew |
| Instructor / Trainer | AE30001 | Ravi Nair |
| Employee | AE10024 | Meera Thomas |

Super Admin and HR require authenticator enrollment on first sign-in. On a populated database, use Super Admin → People to import/provision the canonical role, activate the account, and assign its department. Do not rerun the destructive demo seed on existing data.

Walkthrough: Instructor → My courses → create draft/add content → Submit for approval; Department Head → Course approvals → inspect lesson material → reject with reason or approve; HR → ready-to-publish course → Publish course → Training rollout → choose Employee/Department/Group; Employee → Notifications/My Learning. All roles can use their own learner workspace.

## Open boundaries

Course/instructor feedback is the next approved implementation plan. Course/enrollment dates, broader scheduling/email delivery, profile images, HRMS, mark sheets and arbitrary folder/prerequisite requirements remain in the client remainder register until their implementation and evidence exist.

Live Anthropic answers, Gemini access, physical iPhone and the historical whole-product acceptance gates remain unverified. GitHub CI is blocked by billing. Railway's last verified app build remains `3d8ffcc`; merging this work does not deploy it or authorize another CI bypass.
