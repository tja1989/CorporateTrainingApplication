# Course and instructor feedback design

## Purpose

Implement course-content and instructor feedback from the client's `LMS  demo V 1.docx`, pages 1 and 3, after the five-role and course-approval subsystem. Employees can rate content and the assigned instructor, leave suggestions, and have those responses appear in scoped weekly/monthly reports. The role/approval design defines permissions, department ownership and instructor assignments.

## Selected behavior

Use attributed 1–5 whole-number ratings and optional text comments of at most 2,000 characters. Comments are internal training feedback, not public reviews. The form explains who can read them. Do not describe responses as anonymous.

Course feedback becomes available after the employee completes the assigned course. Instructor feedback is optional and offered only when that learning cycle has a real assigned instructor. A missing instructor produces no fabricated trainer or trainer rating. Do not make feedback a condition for earning the course completion or certificate.

One response of each kind is allowed per employee and completed learning cycle. Employees can amend their own feedback; the update creates an audit revision and shows its saved timestamp. Repeated submit/click/reload does not multiply responses. An employee cannot submit feedback for an unrelated employee, incomplete course or instructor not associated with their completed course.

Feedback is separate from the existing HR assistant thumbs-up/down and assessment grading feedback. Those records cannot be reused as course or instructor evaluations.

## Data model

Add a `course_delivery` association per enrollment/learning cycle that records the assigned instructor and department at assignment/completion. Existing cycles may have no instructor; do not infer a historic trainer from the current course author. New rollout captures the actual instructor. Later course/instructor reassignment does not retarget existing feedback.

Add `course_feedback` with ID, completion-record ID, employee ID, course ID, delivery/department context, 1–5 rating, comment, created/updated timestamps and revision number. Add `instructor_feedback` with the same context plus the snapshotted instructor ID. Enforce one employee/cycle response per kind with database uniqueness and checks for rating range.

An append-only `feedback_revisions` table captures prior/new rating/comment, actor and timestamp for edits and moderation. Return saved feedback to the employee for persisted-state confirmation. Never create default ratings for nonrespondents.

## Authorization and privacy

| Role | Feedback access |
|---|---|
| Employee | Create/read/amend own eligible feedback only |
| Instructor | Aggregate ratings/counts and learner comments for own delivered courses; no learner identity in instructor view/export |
| Department Head | Attributed course feedback and aggregate instructor feedback for own department |
| HR Head / L&T Head | Organization-wide course/instructor feedback reports and comments |
| Super Admin / IT Admin | Organization-wide administration and audited moderation |

The instructor view is de-identified, not promised anonymous; small groups and comments can identify a writer. The employee-facing disclosure says this clearly. HR/Department Head exports preserve the same scope as their pages. Empty department/course assignments produce empty results.

HR Head or Super Admin can hide an abusive/inappropriate comment with a mandatory reason; retain the original and audit event in protected storage. The rating continues to count unless an explicitly audited invalid-response exclusion is selected. Employees see moderation state. No permanent deletion through ordinary feedback controls.

## Learner and management surfaces

- Completed course overview/profile learning history shows **Give course feedback**, or **Edit your feedback** after submission.
- The form has separate Content and Instructor sections. Rating labels describe 1 through 5; comments support suggestions and retain input on errors.
- A saved confirmation includes rating and timestamp, and refresh displays the persisted response.
- HR and Department Head workspaces have **Feedback reports**, with Course / Instructor tabs and week/month/custom date filters.
- Instructor workspace shows own feedback summary and permitted comments.
- Tables present response count, average rating, rating distribution and comments. Show “No responses” rather than an invented zero-star score.
- CSV exports obey the exact same permissions and filters. Include course/instructor, reporting period, response count, average and permitted comment/detail fields.

## Reporting periods and notifications

Use UTC timestamps in storage and the organization's existing timezone for report boundaries. Week starts Monday; months use calendar-month boundaries. Filter responses by submission time, and use their latest valid revision as of the report cutoff. An edit does not become a second response or move the original submission into a later period.

Provide weekly/monthly course and instructor feedback summaries with response counts and links to filtered reports. Notification records are addressed only to authorized HR, Department Head and Instructor recipients. Digest delivery uses a dedupe key combining recipient, kind and period; rerunning a scheduled task cannot duplicate the same digest.

Separate feedback digest scheduling from the existing retention/compliance sweep. Support explicit weekly/monthly execution, report the last successful period, and document the deployment schedule. Real email depends on the email-transport delivery phase; logging or an in-app digest does not qualify email delivery.

## Error handling and persistence

Validate role, eligible completion, delivery instructor, rating range, comment length and revision token on the server. Acquire a per-response lock; stale edits get a clear conflict response with the newer saved value. Content changes, role changes and lost department access cannot widen feedback access. Failures preserve employee-entered ratings/comments and do not alter learning records.

Render comments as text or the existing safe Markdown subset, never arbitrary HTML. User-supplied comments are content, not instructions to assistants or report generators. The UI and exported data handle multiline and multilingual text.

## Migration and acceptance

Add tables/columns idempotently without rewriting prior completions, scores, enrollments or certificates. Legacy completions remain eligible for course feedback; instructor feedback is unavailable where there is no historically known delivery instructor. Test a migration twice against populated isolated data and verify the pre-existing learning history is unchanged.

Required tests and real-backend browser evidence:

1. Employee completes a course, submits both kinds of eligible feedback, refreshes and sees the saved ratings/comments.
2. Editing preserves one response, records a revision and changes the summary correctly; stale simultaneous edits are detected.
3. Invalid ratings, overlong comments, incomplete courses, duplicate submits and another employee's IDs are rejected or idempotent.
4. Instructor reassignment after delivery does not change who receives historical feedback.
5. Instructor, Department Head, HR Head and Super Admin see only permitted records/identities; direct requests and CSV exports enforce the same boundary.
6. Weekly/monthly filters correctly handle timezone boundaries, no-response periods and edits after cutoff; digest reruns do not duplicate delivery.
7. Moderation records a reason and audit history while preserving the original record.
8. Forms/reports work on desktop/mobile, by keyboard and in light/dark themes, using the existing xprtn component contract.

The implementation follows the role/approval delivery and reuses its centralized permission/scope helpers. Opus UI findings can be incorporated without changing these permission and persistence rules implicitly.
