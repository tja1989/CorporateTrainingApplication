# Learner resume migration

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
