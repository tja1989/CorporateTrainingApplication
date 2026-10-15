import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "pg";
import { assertLocalQa } from "../e2e/support";

assertLocalQa();
const client = new Client({ connectionString: process.env.DATABASE_URL });
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tables = [
  "users",
  "courses",
  "enrollments",
  "lesson_progress",
  "attempts",
  "completion_records",
  "certificates",
  "course_deliveries",
  "course_feedback",
  "instructor_feedback",
  "feedback_revisions",
  "feedback_digest_runs",
  "course_workflow_events",
];
async function snapshot() {
  const result: Record<string, string> = {};
  for (const table of tables) {
    const { rows } = await client.query(
      `SELECT to_jsonb(r) AS row FROM ${table} r ORDER BY id`,
    );
    result[table] = hash(
      rows.map(({ row }) => {
        if (table === "users") {
          delete row.department_id;
          delete row.auth_version;
          if (row.role === "MANAGER") row.role = "DEPARTMENT_HEAD";
        }
        if (table === "courses")
          for (const column of [
            "department_id",
            "instructor_id",
            "content_revision",
            "submitted_revision",
            "approved_revision",
            "approval_state",
            "submitted_by",
            "approved_by",
            "starts_at",
            "ends_at",
            "folder_path",
          ])
            delete row[column];
        return row;
      }),
    );
  }
  return result;
}
async function run() {
  await client.connect();
  try {
    const before = await snapshot();
    const sql = readFileSync(
      "migrations/20261014_client_roles_approval.sql",
      "utf8",
    );
    await client.query(sql);
    const feedbackSql = readFileSync(
      "migrations/20261014_course_feedback.sql",
      "utf8",
    );
    await client.query(feedbackSql);
    const planningSql = readFileSync(
      "migrations/20261015_course_planning.sql",
      "utf8",
    );
    await client.query(planningSql);
    const graph = (
      await client.query(
        "SELECT * FROM course_prerequisites ORDER BY course_id,required_course_id",
      )
    ).rows;
    assert.deepEqual(
      await snapshot(),
      before,
      "Migration must preserve identities and every existing learning field",
    );
    const first = (
      await client.query(
        "SELECT row_to_json(d) AS row FROM departments d ORDER BY id",
      )
    ).rows;
    await client.query(sql);
    await client.query(feedbackSql);
    await client.query(planningSql);
    assert.deepEqual(
      (
        await client.query(
          "SELECT * FROM course_prerequisites ORDER BY course_id,required_course_id",
        )
      ).rows,
      graph,
      "Repeated planning migration must preserve chosen prerequisites",
    );
    assert.deepEqual(
      await snapshot(),
      before,
      "Repeated migration must preserve history",
    );
    assert.deepEqual(
      (
        await client.query(
          "SELECT row_to_json(d) AS row FROM departments d ORDER BY id",
        )
      ).rows,
      first,
      "Departments must remain stable",
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM users WHERE role='MANAGER'",
        )
      ).rows[0].n,
      0,
    );
    console.log(
      "PASS: twice-applied migration preserves hashes for thirteen identity/learning/feedback tables.",
    );
    await planningConstraints();
    await scopeFixtures();
  } finally {
    await client.end();
  }
}
async function planningConstraints() {
  const a = "qa-planning-" + randomUUID(),
    b = "qa-planning-" + randomUUID();
  try {
    await client.query(
      "INSERT INTO courses(id,title) VALUES($1,'Planning migration A'),($2,'Planning migration B')",
      [a, b],
    );
    const row = (
      await client.query(
        "SELECT starts_at,ends_at,folder_path FROM courses WHERE id=$1",
        [a],
      )
    ).rows[0];
    assert.deepEqual(row, { starts_at: null, ends_at: null, folder_path: "" });
    await assert.rejects(
      client.query(
        "UPDATE courses SET starts_at='2031-10-22Z',ends_at='2031-10-21Z' WHERE id=$1",
        [a],
      ),
      /courses_planning_date_order/,
    );
    await assert.rejects(
      client.query(
        "INSERT INTO course_prerequisites(course_id,required_course_id) VALUES($1,$1)",
        [a],
      ),
      /course_prerequisites_not_self/,
    );
    await client.query(
      "INSERT INTO course_prerequisites(course_id,required_course_id) VALUES($1,$2)",
      [a, b],
    );
    await assert.rejects(
      client.query(
        "INSERT INTO course_prerequisites(course_id,required_course_id) VALUES($1,$2)",
        [a, b],
      ),
      /unique/,
    );
    await assert.rejects(
      client.query(
        "INSERT INTO course_prerequisites(course_id,required_course_id) VALUES($1,$2)",
        [a, "missing-" + randomUUID()],
      ),
      /foreign key/,
    );
    console.log(
      "PASS: planning defaults, SQL date/self/duplicate/reference constraints and preserved prerequisite graph.",
    );
  } finally {
    await client.query("DELETE FROM courses WHERE id=ANY($1)", [[a, b]]);
  }
}
async function scopeFixtures() {
  const p = `qa-${randomUUID()}`;
  const a = p + "a",
    b = p + "b",
    head = p + "head",
    employee = p + "employee",
    foreign = p + "foreign",
    unassigned = p + "unassigned",
    trainer = p + "trainer",
    empty = p + "empty",
    course = p + "course";
  try {
    await client.query(
      "INSERT INTO departments(id,name) VALUES($1,'QA A'),($2,'QA B')",
      [a, b],
    );
    for (const [id, role, department, manager] of [
      [head, "DEPARTMENT_HEAD", a, null],
      [employee, "LEARNER", a, null],
      [foreign, "LEARNER", b, head],
      [unassigned, "LEARNER", null, head],
      [trainer, "INSTRUCTOR", a, null],
      [empty, "INSTRUCTOR", a, null],
    ]) {
      await client.query(
        "INSERT INTO users(id,employee_id,name,role,department_id,manager_id,group_ids) VALUES($1,$1,'QA scope',$2,$3,$4,'[\"shared-group\"]')",
        [id, role, department, manager],
      );
    }
    await client.query(
      "INSERT INTO courses(id,title,department_id,instructor_id) VALUES($1,'QA common course',$2,$3)",
      [course, b, trainer],
    );
    await client.query(
      "INSERT INTO enrollments(id,user_id,course_id,source) VALUES($1,$2,$3,'manual')",
      [p + "enrollment", employee, course],
    );
    const { trainingScope } = await import("../lib/auth/scope");
    assert.deepEqual(
      await trainingScope({
        id: head,
        role: "DEPARTMENT_HEAD",
        departmentId: a,
      }),
      { userIds: [employee] },
    );
    assert.deepEqual(
      await trainingScope({
        id: head,
        role: "DEPARTMENT_HEAD",
        departmentId: null,
      }),
      { userIds: [], courseIds: [] },
    );
    assert.deepEqual(
      await trainingScope({ id: trainer, role: "INSTRUCTOR", departmentId: a }),
      { userIds: [employee], courseIds: [course] },
    );
    assert.deepEqual(
      await trainingScope({ id: empty, role: "INSTRUCTOR", departmentId: a }),
      { userIds: [], courseIds: [] },
    );
    const { assignDepartment, createDepartment, renameDepartment } =
      await import("../lib/org/departments");
    const admin = {
      id: p + "admin",
      role: "ADMIN" as const,
      departmentId: null,
    };
    await assert.rejects(
      createDepartment(
        { id: head, role: "DEPARTMENT_HEAD", departmentId: a },
        "Unpermitted",
      ),
      /Only Super Admin/,
    );
    await assert.rejects(createDepartment(admin, "   "), /department name/);
    await assert.rejects(
      assignDepartment(admin, foreign, p + "missing"),
      /Department not found/,
    );
    await assignDepartment(admin, foreign, a);
    assert.equal(
      (
        await client.query("SELECT department_id FROM users WHERE id=$1", [
          foreign,
        ])
      ).rows[0].department_id,
      a,
    );
    await renameDepartment(admin, a, "QA renamed");
    assert.equal(
      (await client.query("SELECT name FROM departments WHERE id=$1", [a]))
        .rows[0].name,
      "QA renamed",
    );
    console.log(
      "PASS: real department scope rejects cross-department manager/group matches and unassigned users; Instructor scope is explicit.",
    );
  } finally {
    await client.query("DELETE FROM enrollments WHERE user_id=ANY($1)", [
      [head, employee, foreign, unassigned, trainer, empty],
    ]);
    await client.query("DELETE FROM courses WHERE id=$1", [course]);
    await client.query("DELETE FROM users WHERE id=ANY($1)", [
      [head, employee, foreign, unassigned, trainer, empty],
    ]);
    await client.query("DELETE FROM departments WHERE id=ANY($1)", [[a, b]]);
    const { pool } = await import("../lib/db/client");
    await pool.end();
  }
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
