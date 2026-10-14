BEGIN;
CREATE TABLE IF NOT EXISTS departments (
  id text PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS department_id text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor_id text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS content_revision integer NOT NULL DEFAULT 1;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS submitted_revision integer;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS approved_revision integer;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS submitted_by text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS approved_by text;
CREATE TABLE IF NOT EXISTS course_workflow_events (
  id text PRIMARY KEY, course_id text NOT NULL, actor_id text NOT NULL, actor_role text NOT NULL,
  action text NOT NULL, revision integer NOT NULL, from_state text NOT NULL, to_state text NOT NULL,
  from_publication text NOT NULL, to_publication text NOT NULL, comment text NOT NULL DEFAULT '',
  request_id text NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS course_workflow_request_uniq ON course_workflow_events(request_id);
CREATE INDEX IF NOT EXISTS course_workflow_course_time_idx ON course_workflow_events(course_id,at);
CREATE INDEX IF NOT EXISTS users_department_idx ON users(department_id);
CREATE INDEX IF NOT EXISTS courses_department_idx ON courses(department_id);
CREATE INDEX IF NOT EXISTS courses_instructor_idx ON courses(instructor_id);
INSERT INTO departments (id,name)
SELECT 'legacy-dept-' || id, name || ' team' FROM users WHERE role='MANAGER'
ON CONFLICT (id) DO NOTHING;
UPDATE users SET department_id='legacy-dept-' || id WHERE role='MANAGER' AND department_id IS NULL;
UPDATE users u SET department_id='legacy-dept-' || m.id FROM users m
WHERE u.manager_id=m.id AND m.role='MANAGER' AND u.department_id IS NULL;
UPDATE users SET role='DEPARTMENT_HEAD' WHERE role='MANAGER';
UPDATE courses c SET approval_state='LEGACY_PUBLISHED'
WHERE status='PUBLISHED' AND approval_state='DRAFT'
AND NOT EXISTS (SELECT 1 FROM course_workflow_events e WHERE e.course_id=c.id);
COMMIT;
