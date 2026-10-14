import type { FeedbackInput } from "../lib/feedback/types";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa } from "../e2e/support";
assertLocalQa();
const p = "qa-feedback-service-" + randomUUID();
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { saveFeedback, ownFeedback } =
      await import("../lib/feedback/service");
    const actor = {
      id: p + "employee",
      role: "LEARNER" as const,
      departmentId: p + "dept",
    };
    await c.query(
      "INSERT INTO users(id,employee_id,name,role,password_state) VALUES($1,$1,'QA feedback employee','LEARNER','ACTIVE'),($2,$2,'QA other employee','LEARNER','ACTIVE')",
      [actor.id, p + "other"],
    );
    await c.query(
      "INSERT INTO courses(id,title) VALUES($1,'QA feedback service')",
      [p + "course"],
    );
    await c.query(
      "INSERT INTO completion_records(id,user_id,course_id) VALUES($1,$2,$3),($4,$5,$3),($6,$2,$3)",
      [
        p + "done",
        actor.id,
        p + "course",
        p + "foreign",
        p + "other",
        p + "legacy",
      ],
    );
    await c.query(
      "INSERT INTO course_deliveries(id,enrollment_id,course_id,instructor_id,department_id,completed_record_id) VALUES($1,$2,$3,$4,$5,$6)",
      [
        p + "delivery",
        p + "enrollment",
        p + "course",
        p + "trainer-a",
        p + "dept",
        p + "done",
      ],
    );
    const input: FeedbackInput = {
      completionId: p + "done",
      kind: "course" as const,
      rating: 5,
      comment: "Clear\nمفيد",
      expectedRevision: 0,
      requestId: p + "create",
    };
    await assert.rejects(
      saveFeedback(actor, {
        ...input,
        completionId: p + "incomplete",
        requestId: p + "missing",
      }),
      /completed|completion/i,
    );
    await assert.rejects(
      saveFeedback(actor, {
        ...input,
        completionId: p + "foreign",
        requestId: p + "forged",
      }),
      /completed|completion/i,
    );
    await assert.rejects(
      saveFeedback(actor, {
        ...input,
        completionId: p + "legacy",
        kind: "instructor",
        requestId: p + "unknown",
      }),
      /instructor|trainer/i,
    );
    const first = await saveFeedback(actor, input);
    assert.equal(first.revision, 1);
    assert.deepEqual(await saveFeedback(actor, input), first);
    await assert.rejects(
      saveFeedback(actor, { ...input, kind: "instructor" }),
      /request|conflict/i,
    );
    const outcomes = await Promise.allSettled(
      [3, 4].map((rating, index) =>
        saveFeedback(actor, {
          ...input,
          rating,
          comment: "Edited " + rating,
          expectedRevision: 1,
          requestId: p + "edit" + index,
        }),
      ),
    );
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((r) => r.status === "rejected").length, 1);
    const current = await ownFeedback(actor.id, p + "done");
    assert.equal(current.course?.revision, 2);
    const forgedInstructor: FeedbackInput & { instructorId: string } = {
      ...input,
      kind: "instructor",
      requestId: p + "trainer",
      instructorId: p + "unrelated",
    };
    await saveFeedback(actor, forgedInstructor);
    const trainer = (
      await c.query(
        "SELECT instructor_id FROM instructor_feedback WHERE employee_id=$1",
        [actor.id],
      )
    ).rows[0];
    assert.equal(trainer.instructor_id, p + "trainer-a");
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int n FROM course_feedback WHERE employee_id=$1",
          [actor.id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int n FROM feedback_revisions WHERE actor_id=$1",
          [actor.id],
        )
      ).rows[0].n,
      3,
    );
    assert.equal((await ownFeedback(actor.id, p + "legacy")).delivery, null);
    await c.query("UPDATE users SET erased_at=now() WHERE id=$1", [actor.id]);
    await assert.rejects(
      saveFeedback(actor, {
        ...input,
        expectedRevision: 2,
        requestId: p + "erased",
      }),
      /access|active|account/i,
    );
    console.log(
      "PASS: completed-owner eligibility, unknown legacy trainer, server-derived instructor, idempotent replay, one concurrent edit winner, append-only revisions, Unicode and erased-account rejection.",
    );
  } finally {
    await c.query("DELETE FROM feedback_revisions WHERE actor_id=$1", [
      p + "employee",
    ]);
    for (const table of ["course_feedback", "instructor_feedback"])
      await c.query(`DELETE FROM ${table} WHERE employee_id=$1`, [
        p + "employee",
      ]);
    await c.query("DELETE FROM course_deliveries WHERE course_id=$1", [
      p + "course",
    ]);
    await c.query("DELETE FROM completion_records WHERE course_id=$1", [
      p + "course",
    ]);
    await c.query("DELETE FROM courses WHERE id=$1", [p + "course"]);
    await c.query("DELETE FROM users WHERE id=ANY($1)", [
      [p + "employee", p + "other"],
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
