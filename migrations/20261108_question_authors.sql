BEGIN;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS author_id text REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS questions_author_idx ON questions(author_id);
CREATE INDEX IF NOT EXISTS questions_bank_status_idx ON questions(bank_id, status);
COMMIT;
