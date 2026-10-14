import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa } from "../e2e/support";
import { feedbackReportFixture } from "../e2e/feedback-report-fixtures";
import { saveFeedback, ownFeedback } from "../lib/feedback/service";
import { exportUserData, eraseUser } from "../lib/dsr";
import { feedbackReport, feedbackCsv } from "../lib/feedback/reports";
import { feedbackPeriod } from "../lib/feedback/periods";
assertLocalQa();
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const f = await feedbackReportFixture();
  const actor = (p: any) => ({
    id: p.id,
    role: p.role,
    departmentId: p.departmentId,
  });
  const privateText = "PRIVATE_FEEDBACK_" + randomUUID();
  try {
    const row = (
      await c.query(
        "SELECT * FROM course_feedback WHERE employee_id=$1 AND course_id=$2",
        [f.employee.id, f.course],
      )
    ).rows[0];
    await saveFeedback(actor(f.employee), {
      completionId: row.completion_record_id,
      kind: "course",
      rating: 4,
      comment: privateText,
      expectedRevision: 1,
      requestId: randomUUID(),
    });
    const exported = await exportUserData(f.employee.id);
    assert.ok(
      JSON.stringify(exported.courseFeedback ?? []).includes(privateText),
      "DSR export must include own course feedback",
    );
    assert.ok(Array.isArray(exported.instructorFeedback));
    assert.ok(JSON.stringify(exported.feedbackRevisions).includes(privateText));
    const { moderateFeedback } = await import("../lib/feedback/moderation");
    const requestId = randomUUID(),
      mod = {
        kind: "course" as const,
        id: row.id,
        expectedRevision: 2,
        hidden: true,
        excluded: false,
        reason: "Protect private details " + privateText,
        requestId,
      };
    await assert.rejects(
      moderateFeedback(actor(f.trainer), mod),
      /Not authorized/,
    );
    await assert.rejects(
      moderateFeedback(actor(f.head), mod),
      /Not authorized/,
    );
    await assert.rejects(
      moderateFeedback(actor(f.hr), { ...mod, reason: " " }),
      /reason/,
    );
    await moderateFeedback(actor(f.hr), mod);
    await moderateFeedback(actor(f.hr), mod);
    let own = await ownFeedback(f.employee.id, row.completion_record_id);
    assert.equal(own.course?.revision, 3);
    assert.equal(own.course?.commentHidden, true);
    assert.equal(own.course?.comment, privateText);
    const filters = {
      kind: "course" as const,
      courseId: f.course,
      period: feedbackPeriod("month", new Date(), "Asia/Dubai"),
    };
    const hidden = await feedbackReport(actor(f.trainer), filters);
    assert.equal(hidden.responses, 1);
    assert.equal(hidden.average, 4);
    assert.ok(!feedbackCsv(hidden).includes(privateText));
    await moderateFeedback(actor(f.hr), {
      ...mod,
      expectedRevision: 3,
      excluded: true,
      reason: "Invalid response",
      requestId: randomUUID(),
    });
    assert.equal(
      (await feedbackReport(actor(f.trainer), filters)).responses,
      0,
    );
    await moderateFeedback(actor(f.hr), {
      ...mod,
      expectedRevision: 4,
      excluded: false,
      reason: "Valid response restored",
      requestId: randomUUID(),
    });
    const now = new Date();
    const previous = feedbackPeriod(
      "month",
      new Date(feedbackPeriod("month", now, "Asia/Dubai").start.getTime() - 1),
      "Asia/Dubai",
    );
    const submitted = new Date(previous.start.getTime() + 86400000);
    for (const table of ["course_feedback", "instructor_feedback"])
      await c.query(`UPDATE ${table} SET created_at=$2 WHERE course_id=$1`, [
        f.course,
        submitted,
      ]);
    await c.query(
      "UPDATE feedback_revisions SET at=$2 WHERE response_id IN(SELECT id FROM course_feedback WHERE course_id=$1 UNION SELECT id FROM instructor_feedback WHERE course_id=$1)",
      [f.course, submitted],
    );
    const { runFeedbackDigests } = await import("../lib/feedback/digests");
    const first = await runFeedbackDigests("month", now),
      again = await runFeedbackDigests("month", now);
    assert.ok(first.sent > 0);
    assert.equal(again.sent, 0);
    assert.equal(again.alreadySent, first.sent + first.alreadySent);
    const trigger = "qa_feedback_" + randomUUID().replaceAll("-", "");
    await c.query(
      `CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${f.hr.id}' AND NEW.kind='course_feedback_digest' THEN RAISE EXCEPTION 'QA partial digest failure'; END IF; RETURN NEW; END $$`,
    );
    await c.query(
      `CREATE TRIGGER "${trigger}" BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`,
    );
    try {
      await runFeedbackDigests("week", now);
      assert.fail("Expected a partial digest failure");
    } catch (error) {
      assert.match((error as Error).message, /partial failure/);
      const failure = error as { failures: string[] };
      assert.equal(failure.failures.length, 1);
      assert.ok(failure.failures[0].includes(f.hr.id + "/course"));
    } finally {
      await c.query(`DROP TRIGGER IF EXISTS "${trigger}" ON notifications`);
      await c.query(`DROP FUNCTION IF EXISTS "${trigger}"()`);
    }
    const week = await runFeedbackDigests("week", now);
    assert.equal(
      week.sent,
      1,
      "Retry must deliver only the failed recipient/kind",
    );
    const weekAgain = await runFeedbackDigests("week", now);
    assert.equal(weekAgain.sent, 0);
    assert.equal(weekAgain.alreadySent, week.sent + week.alreadySent);
    console.log(
      "PASS: injected notification failure rolls back its period marker; rerun delivers just the missing summary without duplicating successful recipients.",
    );
    const ids = [f.hr, f.head, f.trainer, f.otherTrainer].map((p) => p.id);
    const notifications = (
      await c.query(
        "SELECT * FROM notifications WHERE user_id=ANY($1) AND kind IN('course_feedback_digest','instructor_feedback_digest') AND payload->>'intervalKind'='month'",
        [ids],
      )
    ).rows;
    assert.equal(notifications.length, 8);
    for (const n of notifications) {
      assert.ok(!JSON.stringify(n.payload).includes(privateText));
      assert.ok(n.payload.href.startsWith("/feedback?"));
      assert.equal(n.payload.responses, n.user_id === f.hr.id ? 2 : 1);
    }
    const history = (
      await c.query("SELECT * FROM completion_records WHERE user_id=$1", [
        f.employee.id,
      ])
    ).rows;
    const race = await Promise.allSettled([
      eraseUser(f.employee.id),
      saveFeedback(actor(f.employee), {
        completionId: row.completion_record_id,
        kind: "instructor",
        rating: 4,
        comment: privateText + "_RACE",
        expectedRevision: 1,
        requestId: randomUUID(),
      }),
    ]);
    assert.equal(race[0].status, "fulfilled");
    const after = await exportUserData(f.employee.id);
    assert.ok(!JSON.stringify(after).includes(privateText));
    assert.ok(!JSON.stringify(after).includes(f.employee.name));
    assert.deepEqual(
      (
        await c.query("SELECT * FROM completion_records WHERE user_id=$1", [
          f.employee.id,
        ])
      ).rows,
      history,
    );
    await assert.rejects(
      ownFeedback(f.employee.id, row.completion_record_id),
      /account access/,
    );
    await assert.rejects(
      saveFeedback(actor(f.employee), {
        completionId: row.completion_record_id,
        kind: "course",
        rating: 5,
        comment: "Resurrect",
        expectedRevision: 5,
        requestId: randomUUID(),
      }),
      /account access/,
    );
    assert.equal(
      (
        await feedbackReport(actor(f.trainer), {
          ...filters,
          period: {
            start: previous.start,
            end: new Date(now.getTime() + 86400000),
            label: "All QA feedback",
          },
        })
      ).responses,
      1,
    );
    console.log(
      "PASS: moderation permission/reason/replay, hidden rating preservation, audited exclusion/restoration, own DSR export, concurrent erasure/write protection, private revision/reason scrubbing, retained completion/aggregate history, scoped period digests and rerun deduplication.",
    );
  } finally {
    const ids = [
      f.hr,
      f.head,
      f.trainer,
      f.otherTrainer,
      f.employee,
      f.foreign,
    ].map((p) => p.id);
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
    await c.query("DELETE FROM notifications WHERE user_id=ANY($1)", [ids]);
    await c.query(
      "DELETE FROM feedback_digest_runs WHERE recipient_id=ANY($1)",
      [ids],
    );
    await c.query("DELETE FROM courses WHERE id=$1", [f.course]);
    await c.query("DELETE FROM users WHERE id=ANY($1)", [ids]);
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
