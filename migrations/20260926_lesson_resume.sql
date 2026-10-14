-- Additive and safe to run more than once. Existing progress/completions are unchanged.
BEGIN;
ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS last_position_sec real;
COMMIT;
