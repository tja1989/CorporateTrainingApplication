import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa } from "../e2e/support";
import { feedbackReportFixture } from "../e2e/feedback-report-fixtures";
import { feedbackReport, feedbackCsv } from "../lib/feedback/reports";
import { feedbackPeriod } from "../lib/feedback/periods";
import { saveFeedback } from "../lib/feedback/service";
assertLocalQa();
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const f = await feedbackReportFixture();
  const actor = (person: any) => ({
    id: person.id,
    role: person.role,
    departmentId: person.departmentId,
  });
  try {
    const response = (
      await c.query(
        "SELECT * FROM course_feedback WHERE employee_id=$1 AND course_id=$2",
        [f.employee.id, f.course],
      )
    ).rows[0];
    await c.query(
      "UPDATE course_feedback SET created_at='2026-10-02T00:00:00Z' WHERE id=$1",
      [response.id],
    );
    await c.query(
      "UPDATE feedback_revisions SET at='2026-10-02T00:00:00Z' WHERE kind='course' AND response_id=$1",
      [response.id],
    );
    const edit = randomUUID();
    await saveFeedback(actor(f.employee), {
      completionId: response.completion_record_id,
      kind: "course",
      rating: 1,
      comment: "Late edit",
      expectedRevision: 1,
      requestId: edit,
    });
    await c.query(
      "UPDATE feedback_revisions SET at='2026-11-05T00:00:00Z' WHERE request_id=$1",
      [edit],
    );
    const filters = {
      kind: "course" as const,
      courseId: f.course,
      period: feedbackPeriod("month", new Date("2026-10-14Z"), "Asia/Dubai"),
    };
    const hr = await feedbackReport(actor(f.hr), filters);
    assert.equal(hr.responses, 2);
    assert.equal(hr.average, 3.5);
    assert.ok(hr.rows.flat().includes("Helpful examples"));
    assert.ok(!hr.rows.flat().includes("Late edit"));
    assert.equal(
      (
        await feedbackReport(actor(f.hr), {
          ...filters,
          period: feedbackPeriod(
            "month",
            new Date("2026-11-14Z"),
            "Asia/Dubai",
          ),
        })
      ).responses,
      0,
    );
    const head = await feedbackReport(actor(f.head), filters);
    assert.equal(head.responses, 1);
    assert.ok(!feedbackCsv(head).includes(f.foreign.employeeId));
    const trainer = await feedbackReport(actor(f.trainer), filters);
    assert.equal(trainer.responses, 1);
    assert.ok(!feedbackCsv(trainer).includes(f.employee.employeeId));
    assert.ok(!trainer.columns.join().includes("Employee"));
    const aggregate = await feedbackReport(actor(f.head), {
      ...filters,
      kind: "instructor",
    });
    assert.equal(aggregate.responses, 1);
    assert.ok(!aggregate.columns.join().includes("Comment"));
    assert.ok(!feedbackCsv(aggregate).includes("Helpful examples"));
    await c.query(
      "UPDATE course_feedback SET comment_hidden=true WHERE id=$1",
      [response.id],
    );
    const hidden = await feedbackReport(actor(f.trainer), filters);
    assert.equal(hidden.responses, 1);
    assert.equal(hidden.average, 5);
    assert.ok(!feedbackCsv(hidden).includes("Helpful examples"));
    await c.query("UPDATE users SET department_id=NULL WHERE id=$1", [
      f.head.id,
    ]);
    const empty = await feedbackReport(actor(f.head), filters);
    assert.equal(empty.responses, 0);
    assert.equal(empty.average, null);
    assert.deepEqual(empty.rows, []);
    console.log(
      "PASS: actual SQL cutoff preserves historical rating/cohort, current hiding suppresses old comments, shared-group foreign rows stay scoped, delivered Instructor survives reassignment, Department Head instructor detail is aggregate only, and current missing membership fails closed.",
    );
  } finally {
    await c.query(
      "DELETE FROM feedback_revisions WHERE response_id IN(SELECT id FROM course_feedback WHERE course_id=$1 UNION SELECT id FROM instructor_feedback WHERE course_id=$1)",
      [f.course],
    );
    for (const table of [
      "course_feedback",
      "instructor_feedback",
      "course_deliveries",
      "completion_records",
      "enrollments",
    ])
      await c.query(`DELETE FROM ${table} WHERE course_id=$1`, [f.course]);
    await c.query("DELETE FROM courses WHERE id=$1", [f.course]);
    const users = [
      f.hr,
      f.head,
      f.trainer,
      f.otherTrainer,
      f.employee,
      f.foreign,
    ].map((p) => p.id);
    await c.query("DELETE FROM login_attempts WHERE key=ANY($1)", [
      [f.hr, f.head, f.trainer, f.otherTrainer, f.employee, f.foreign].map(
        (p) => p.employeeId,
      ),
    ]);
    await c.query("DELETE FROM users WHERE id=ANY($1)", [users]);
    await c.query("DELETE FROM departments WHERE id=ANY($1)", [
      [f.employee.departmentId, f.foreign.departmentId],
    ]);
    await c.end();
    const { pool } = await import("../lib/db/client");
    await pool.end();
  }
}
run().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
