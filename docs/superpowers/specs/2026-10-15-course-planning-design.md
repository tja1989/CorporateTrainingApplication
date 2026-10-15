# Course scheduling, prerequisites and folders

## Approval and purpose

The user approved the proposed scheduling design and explicitly requested continued implementation and preview restart on 15 October 2026. Preserve the previously chosen direct execution method. This document records that approved design in executable detail; routine implementation decisions stay within it. The existing role/approval and feedback implementation is on main at `fdaa3df`.

Employees must understand when assigned training opens, when it is due, what must be completed first and where to find it. Authors must configure that information without bypassing Department Head approval. Existing courses, enrollments, completion history, certificates and feedback must survive the additive change.

## Course dates

- Add nullable `courses.starts_at` and `courses.ends_at` timestamps. Existing courses remain undated and retain their behavior.
- Authors enter calendar dates in the existing organization timezone, `Asia/Dubai`. A start date opens at local midnight; an end date includes that calendar day, through 23:59:59 local. Display the timezone beside inputs and dates.
- Reject nonexistent calendar dates and an end date preceding the start date. Either date can be omitted. Past dates are valid for authoring historical/overdue training; dates are not an automatic publication mechanism.
- Only currently published/approved training is assignable. Approved published future courses can be assigned before they open and appear as Upcoming. A future start blocks lesson content, assessment starts/saves/submissions, video credit, Tutor context and oral-check entry/events until it opens.
- The end date is a completion target. It never closes learning or invalidates existing evidence, and overdue employees can finish. An explicitly supplied enrollment deadline takes precedence; otherwise a new enrollment uses the course end date. Existing enrollment deadlines are never rewritten when the course is edited.
- A new assignment deadline cannot precede the course opening. A conflicting manual rollout returns an actionable error and writes nothing; automatic rule/path/renewal assignments remain pending rather than resetting progress or creating an impossible/partial path. Future assignments with a suitable deadline remain supported.
- Show each person's actual enrollment creation date for their current learning cycle, separately from course start/end and their assignment deadline. Renewals keep earlier completion/feedback/certificate history.

## Explicit prerequisites

- Add `course_prerequisites(course_id, required_course_id)` with a unique pair, foreign keys and a self-reference check. This is separate from the existing ordered-path requirement; both apply.
- The course settings form offers published/approved courses as prerequisites. Retain existing selected dependencies for review even if later archived, without revealing other authors' drafts. Validate server-side ownership, identifiers, existence, publication eligibility for newly selected dependencies, duplicate/self/cyclic dependencies and stale course revision.
- A prerequisite is satisfied by an immutable completion record for that employee. Renewal resets of lesson progress do not erase proof of having completed the prerequisite. Do not substitute percentage progress or an unfinished assessment for completion.
- Direct and indirect cycles are rejected. Graph validation and writes share the existing serialized curriculum transaction so two concurrent edits cannot create a cycle.
- All required completions must exist before course learning is credited. A missing/archived unfinished dependency blocks access with a recoverable explanation; it must not silently unlock training. Existing historical certificates, completion records and own feedback remain independently readable.
- New requests recheck planning restrictions. Completion checks again inside the serialized learning transaction. Short shared curriculum locks protect learning writes against a competing author change; no provider request is held under a long database transaction.

## Nested course folders

Folders organize courses; they do not grant access or replace modules/chapters. Store a normalized `courses.folder_path`, default empty, for example `Operations/Safety/Food handling`. Authors move a course by editing this field in its draft settings; folder changes follow the same draft/revision contract as other course settings.

Paths support Unicode names, trim segments, use `/` separators, and reject empty interior segments, `.`/`..`, backslashes, control characters, segments over 80 characters, paths over 640 characters and more than 8 levels. No filesystem operation is performed. Empty means the catalog root. A folder exists when it contains a course; standalone empty-folder management and organization-wide bulk rename are outside this design.

The catalog provides nested child-folder links, breadcrumbs and a folder filter that includes descendants on segment boundaries. `Safety` must not include `Safetyware`. Counts respect the current My courses/Upcoming/Browse audience and filters, and unpublished course titles never enter the learner catalog. Existing search/filter/sort/pagination/Back behavior persists; URLs carry folder selection.

## Interfaces and surfaces

- `lib/courses/planning.ts`: pure date parsing, folder normalization/tree derivation, prerequisite graph validation and schedule/deadline decisions.
- `lib/courses/planning-service.ts`: transactional planning updates/validation and dependency reads, called inside `mutateDraftCourse`.
- `lib/lms/planning-access.ts`: current published course schedule and prerequisite-completion decision, using the caller's database connection where supplied.
- Shared learner entry and write guards consume that decision; existing path/lesson restrictions remain in force.
- Course Settings adds Dates, Prerequisites and Folder fields using existing xprtn controls. Missing fields from an older form preserve planning metadata rather than clearing it.
- My Learning adds an Upcoming view for assigned incomplete courses opening in the future, ordered by opening date. My courses continues to show those assignments with an opening label. Browse can show future published training with an honest opening label, never an active lesson action.
- Course detail shows date/enrollment/prerequisite context and a clear blocked state; historical learning evidence remains accessible. Cards/Home must not recommend a future lesson as ready to start.
- Keep the established Operate visual system, mobile layout, dark mode, keyboard controls and 44px targets. No visual-world redesign or new dependency.

## Migration and release

Use an additive repeatable SQL migration after role/feedback migrations in deployment initialization. Apply it twice on a preserved populated clone and compare hashes of pre-existing columns in identity/content/learning/feedback history. No reseeding of populated databases, no destructive schema repair and no inferred historical dates or prerequisites.

Keep the current 32-person provider-free preview available while developing in the existing isolated checkout; qualify against the separate local test database. After review, rebuild main, verify affected cross-role paths, push main under the user's existing integration authorization and refresh the clean preview. This does not authorize Railway deployment, CI bypass, real SMTP sends or HRMS access.

## Acceptance

1. Existing undated courses and all preserved histories survive migration twice.
2. Author saves dates/folders/prerequisites; invalid dates/cycles/foreign author edits fail without partial writes; edits invalidate approval and stale saves fail.
3. Approved future training can be assigned and appears Upcoming; before/at-opening boundaries work in Asia/Dubai without relying on the browser clock.
4. Lesson/page/progress/quiz/Tutor/oral boundaries enforce start/prerequisite restrictions; completion and certificates cannot be forged through a direct request or a racing author change.
5. Historical prerequisite completion survives renewal; target training unlocks only when all requirements are satisfied; existing path restrictions remain effective.
6. End dates do not block overdue completion. New deadlines follow explicit-override/course-target precedence; existing due dates and prior enrollment/completion cycles are unchanged.
7. Nested folder navigation, descendant filtering, breadcrumbs and Back work without sibling-prefix leakage; filtered course counts are accurate.
8. Desktop/mobile Chromium plus Firefox/WebKit complete real author→approve→publish→assign→open/unlock→complete/certificate flows; empty/error/keyboard/dark states stay usable.

## Continuing client scope

Notification composition/start/end events and real email/scheduling, profile/dashboard/mark-sheet detail, HRMS synchronization, and leadership/video-quiz clarification remain active subsequent client work. This phase supplies planning dates for later alert events; it does not claim those remaining systems are complete.
