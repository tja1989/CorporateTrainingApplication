-- Client rule: learners cannot skip lessons. Every course completes in order.
-- Repeatable; changes only the ordering setting, never learning history.
BEGIN;
ALTER TABLE courses ALTER COLUMN sequential_lock SET DEFAULT true;
UPDATE courses SET sequential_lock = true WHERE sequential_lock IS DISTINCT FROM true;
COMMIT;
