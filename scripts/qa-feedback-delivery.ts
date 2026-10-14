import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa } from "../e2e/support";
assertLocalQa();
const p = "qa-feedback-" + randomUUID();
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query(
      "INSERT INTO users(id,employee_id,name,role,password_state) VALUES($1,$1,'QA feedback employee','LEARNER','ACTIVE')",
      [p + "employee"],
    );
    await c.query(
      "INSERT INTO courses(id,title,status,approval_state,department_id,instructor_id,certificate_enabled) VALUES($1,'QA feedback course','PUBLISHED','LEGACY_PUBLISHED',$2,$3,true)",
      [p + "course", p + "department", p + "trainer-a"],
    );
    await c.query(
      "INSERT INTO modules(id,course_id,title,sort) VALUES($1,$2,'QA module',0)",
      [p + "module", p + "course"],
    );
    await c.query(
      "INSERT INTO lessons(id,module_id,title,type,sort,payload) VALUES($1,$2,'QA content','TEXT',0,$3)",
      [p + "lesson", p + "module", JSON.stringify({ body: "Valid content" })],
    );
    const { enrollUser } = await import("../lib/lms/rules");
    const { markLessonComplete } = await import("../lib/lms/completion");
    await enrollUser(
      p + "employee",
      { type: "course", id: p + "course" },
      "manual",
      null,
      null,
    );
    const first = (
      await c.query("SELECT id FROM enrollments WHERE user_id=$1", [
        p + "employee",
      ])
    ).rows[0].id;
    await c.query("UPDATE courses SET instructor_id=$2 WHERE id=$1", [
      p + "course",
      p + "trainer-b",
    ]);
    await markLessonComplete(p + "employee", p + "lesson");
    const delivered = (
      await c.query("SELECT * FROM course_deliveries WHERE enrollment_id=$1", [
        first,
      ])
    ).rows[0];
    assert.equal(
      delivered?.instructor_id,
      p + "trainer-a",
      "Original assignment must keep Instructor A after reassignment and completion",
    );
    assert.ok(delivered.completed_record_id);
    const oldCompletion = (
      await c.query("SELECT * FROM completion_records WHERE id=$1", [
        delivered.completed_record_id,
      ])
    ).rows[0];
    await enrollUser(
      p + "employee",
      { type: "course", id: p + "course" },
      "recert",
      p + "certificate",
      new Date(),
    );
    await markLessonComplete(p + "employee", p + "lesson");
    const rows = (
      await c.query(
        "SELECT * FROM course_deliveries WHERE course_id=$1 ORDER BY created_at",
        [p + "course"],
      )
    ).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[1].instructor_id, p + "trainer-b");
    assert.notEqual(rows[1].completed_record_id, delivered.completed_record_id);
    assert.deepEqual(
      (
        await c.query("SELECT * FROM completion_records WHERE id=$1", [
          oldCompletion.id,
        ])
      ).rows[0],
      oldCompletion,
    );
    await c.query(
      "INSERT INTO enrollments(id,user_id,course_id,source,status) VALUES($1,$2,$3,'manual','NOT_STARTED')",
      [p + "legacy", p + "employee", p + "course"],
    );
    const { db } = await import("../lib/db/client");
    const { linkCompletionDelivery } = await import("../lib/feedback/delivery");
    await db.transaction((tx) =>
      linkCompletionDelivery(tx, p + "legacy", p + "legacy-done"),
    );
    const legacy = (
      await c.query(
        "SELECT instructor_id,department_id FROM course_deliveries WHERE enrollment_id=$1",
        [p + "legacy"],
      )
    ).rows[0];
    assert.deepEqual(legacy, { instructor_id: null, department_id: null });
    console.log(
      "PASS: actual assignment/completion/renewal preserves A→B delivery identities, links separate completions, leaves legacy instructor unknown and preserves old completion bytes.",
    );
    for (const table of ["course_feedback", "instructor_feedback"]) {
      await assert.rejects(
        c.query(
          `INSERT INTO ${table}(id,employee_id,completion_record_id,course_id,rating${table === "instructor_feedback" ? ",instructor_id" : ""}) VALUES($1,$2,$3,$4,6${table === "instructor_feedback" ? ",'QA trainer'" : ""})`,
          [p + "bad", p + "employee", p + "done", p + "course"],
        ),
        /check constraint/,
      );
    }
    console.log(
      "PASS: database rejects out-of-range course and instructor ratings.",
    );
  } finally {
    await c.query("DELETE FROM course_deliveries WHERE course_id=$1", [
      p + "course",
    ]);
    const tables = (
      await c.query(
        "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id'",
      )
    ).rows;
    for (const { table_name } of tables)
      await c.query(`DELETE FROM "${table_name}" WHERE user_id=$1`, [
        p + "employee",
      ]);
    await c.query("DELETE FROM lessons WHERE id=$1", [p + "lesson"]);
    await c.query("DELETE FROM modules WHERE id=$1", [p + "module"]);
    await c.query("DELETE FROM courses WHERE id=$1", [p + "course"]);
    await c.query("DELETE FROM users WHERE id=$1", [p + "employee"]);
    await c.end();
    const { pool } = await import("../lib/db/client");
    await pool.end();
  }
}
run().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
