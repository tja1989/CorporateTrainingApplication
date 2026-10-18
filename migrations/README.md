# Learner resume migration

## Client roles and course approval

`20261014_client_roles_approval.sql` is additive and repeatable. Deployment first
creates the schema, then runs the entire SQL transaction (after an optional fresh
demo seed) before reporting ready. Existing managers become Department Heads with
a dedicated department and their direct reports retain all other identity fields.
Unassigned people stay unassigned. Existing published courses remain available as
`LEGACY_PUBLISHED`; newer recorded workflow decisions are never reclassified.

Back up before deployment. The loopback-only `scripts/qa-client-migration.ts`
applies this migration twice and compares stable hashes of identities and six
learning/content tables; it also verifies populated department/instructor scopes.
Rollback keeps the added fields and events. An older binary expecting MANAGER
requires a compatibility role reader before rollback; do not reverse roles while
newer processes run. Never drop learning history or reseed a populated database.

Before deploying the learner journey build, back up the database and apply
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260926_lesson_resume.sql`.
The nullable column has no backfill: historical progress, watched buckets,
completion records and certificates stay intact. Running the migration again is safe.
A missing/null position starts playback at the beginning; saved positions are
validated and clamped to the stored video duration on each heartbeat.

Verify with `SELECT count(*) AS rows, count(last_position_sec) AS resumed FROM lesson_progress;`
and compare the row count with the pre-migration count.

Rollback: deploy the previous application and leave the nullable column in place.
This retains saved positions and is compatible with the older schema. If a full
schema rollback is required, export `id,last_position_sec` first and, only after
all newer processes are stopped, run `ALTER TABLE lesson_progress DROP COLUMN IF EXISTS last_position_sec;`.
Dropping the column loses resume positions only; no progress history needs deletion.
Do not reseed or run a destructive schema reset.

## Optional correction for the original WHO demo video

The original `3PmVJQUCm4E` seed inferred 148 seconds from its authored demo SRT,
but the public embedded video is 86 seconds (verified in the player on 2026-09-26).
The seed source now sets its verified playback duration after ingest. For existing
matching demo data, first review the row and then apply this narrowly scoped update:

```sql
UPDATE videos SET duration_sec = 86
WHERE youtube_id = '3PmVJQUCm4E' AND duration_sec = 148
  AND title = 'Hand hygiene for fresh food areas' AND transcript_source = 'manual';
```

This preserves every historical progress/completion row. It is a demo metadata
repair, not permission to accept client-reported durations as compliance authority.
The authored demo transcript remains illustrative and is not a verbatim transcript
of the public placeholder video; replace both when using real training content.

The retained demo SRT has cue 6 from 1:20–1:38 and cues 7–9 from 1:38–2:28.
Thus cue 6 extends beyond the 1:26 public video and the final three cues begin
after it ends. These illustrative timestamps cannot qualify transcript/tutor seek
accuracy against this placeholder video. Qualification must use a video and its
matching transcript; keep that content gate separate from the verified player
resume/completion behavior. No transcript content was deleted or retimed here.

## Assessment forward navigation

Apply `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260927_attempt_navigation.sql`
before starting the updated application. The additive, repeatable migration stores
an attempt's server-authoritative forward position. It does not change answers,
results, reviews, completion history or certificates. Historical attempts have no
recoverable navigation boundary; their initial value is explicitly zero, including
previously skipped questions. New forward moves are persisted with answers.

Compare attempt row counts and a hash of all pre-existing columns before and after
applying the migration twice. Verify that every legacy navigation_index is zero.
Rollback: stop the newer application, restore the previous application and retain
the compatible extra column. To remove the column, export id,navigation_index first
and run `ALTER TABLE attempts DROP COLUMN IF EXISTS navigation_index;` only after
all newer processes stop. Dropping it loses forward-position enforcement across
refresh, so leaving it in place is preferred. Never delete attempt history.

Fresh fictional demo content is built while draft, then published as legacy demo material. Populated-database startup performs migrations only; it never appends supplemental lessons to reviewed courses. Department Head weekly digests follow department membership after role conversion.

The client role migration also adds `users.auth_version` with default zero. Existing signed cookies remain generation zero until an account reset increments the generation; activation increments it again and issues only the new generation. Older cookies cannot become valid again after reactivation. No passwords or historical learning fields are rewritten by this additive column.

`20261014_course_feedback.sql` adds immutable assignment deliveries, separate course/instructor responses and append-only initial/edit/moderation revisions. It is repeatable and adds range/uniqueness checks even when Drizzle creates the tables first. Existing enrollment, completion, attempt and certificate rows are unchanged. Existing unsnapshotted cycles retain an unknown historical instructor; never backfill it from a current course owner. New assignment and completion writes capture/link the snapshot within their learning transaction.

The feedback migration also creates `feedback_digest_runs`; its unique recipient/interval/feedback-kind/start key is committed with the in-app notification. Repeating an invocation cannot duplicate a successful delivery. Failed recipient transactions leave no completion marker and are retried independently.

`20261015_course_planning.sql` adds nullable organization-time course dates, an empty default folder path and a separate prerequisite graph. It never infers historical dates, changes enrollment deadlines or backfills dependencies. Dates constrain opening and target completion, without closing overdue learning. Apply it after the role/feedback migrations and before starting the newer application. It is repeatable. Keep the compatible columns/table during an application rollback; export prerequisite choices before any later deliberate removal. Do not reseed a populated database.

`20261018_lessons_in_order.sql` applies the client rule that learners cannot skip lessons: every course completes in order, and new courses default to it. The course editor no longer offers the toggle. It changes only the ordering setting, never progress, completions or certificates, and is repeatable.
