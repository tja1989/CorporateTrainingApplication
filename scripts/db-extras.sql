-- Post-push extras: extensions, ANN + FTS indexes. Idempotent.
CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW (cosine) ANN indexes — production default per spec §9.2
CREATE INDEX IF NOT EXISTS video_chunks_embedding_hnsw
  ON video_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS policy_chunks_embedding_hnsw
  ON policy_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text GIN expression indexes (hybrid retrieval + search)
CREATE INDEX IF NOT EXISTS video_chunks_fts
  ON video_chunks USING gin (to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS policy_chunks_fts
  ON policy_chunks USING gin (to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS courses_fts
  ON courses USING gin (to_tsvector('english', title || ' ' || description));
CREATE INDEX IF NOT EXISTS lessons_fts
  ON lessons USING gin (to_tsvector('english', title || ' ' || coalesce(search_text, '')));

-- One active enrollment per user+course (idempotent rule re-evaluation, spec FR-3.2)
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_active_uniq
  ON enrollments (user_id, course_id)
  WHERE status IN ('NOT_STARTED', 'IN_PROGRESS');

UPDATE live_interviews SET outcome = 'FAIL' WHERE outcome = 'NEEDS_REVIEW';
