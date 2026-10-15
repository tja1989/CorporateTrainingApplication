BEGIN;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS folder_path text NOT NULL DEFAULT '';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='courses_planning_date_order' AND conrelid='courses'::regclass) THEN
    ALTER TABLE courses ADD CONSTRAINT courses_planning_date_order CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='courses_folder_path_length' AND conrelid='courses'::regclass) THEN
    ALTER TABLE courses ADD CONSTRAINT courses_folder_path_length CHECK (char_length(folder_path) <= 640);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS course_prerequisites (
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  required_course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id,required_course_id)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='course_prerequisites_not_self' AND conrelid='course_prerequisites'::regclass) THEN
    ALTER TABLE course_prerequisites ADD CONSTRAINT course_prerequisites_not_self CHECK (course_id <> required_course_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS course_prerequisites_required_idx ON course_prerequisites(required_course_id);
COMMIT;
