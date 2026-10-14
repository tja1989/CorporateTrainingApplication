import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa } from "../e2e/support";
import { feedbackReportFixture } from "../e2e/feedback-report-fixtures";
import { eraseUser } from "../lib/dsr";
import { saveFeedback } from "../lib/feedback/service";
import { moderateFeedback } from "../lib/feedback/moderation";
import {
  runFeedbackDigests,
  previousFeedbackPeriod,
} from "../lib/feedback/digests";
import { pool } from "../lib/db/client";
import { canonicalRole } from "../lib/auth/roles";

assertLocalQa();
const mode = process.argv[2];
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const f = await feedbackReportFixture();
  const actor = (p: typeof f.employee) => ({
    id: p.id,
    role: canonicalRole(p.role)!,
    departmentId: p.departmentId,
  });
  const row = (
    await c.query(
      "SELECT * FROM course_feedback WHERE employee_id=$1 AND course_id=$2",
      [f.employee.id, f.course],
    )
  ).rows[0];
  const trigger = "qa_review_" + randomUUID().replaceAll("-", "");
  try {
    if (mode === "atomic") {
      const beforeUser = (
        await c.query("SELECT * FROM users WHERE id=$1", [f.employee.id])
      ).rows;
      const beforeResponse = (
        await c.query("SELECT * FROM course_feedback WHERE id=$1", [row.id])
      ).rows;
      await c.query(
        `CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.employee_id='${f.employee.id}' AND NEW.comment='' THEN RAISE EXCEPTION 'QA erasure commit failure'; END IF; RETURN NEW; END $$`,
      );
      await c.query(
        `CREATE CONSTRAINT TRIGGER "${trigger}" AFTER UPDATE ON course_feedback DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`,
      );
      try {
        await assert.rejects(eraseUser(f.employee.id), (error) =>
          String((error as Error).cause).includes("QA erasure commit failure"),
        );
        assert.deepEqual(
          (await c.query("SELECT * FROM users WHERE id=$1", [f.employee.id]))
            .rows,
          beforeUser,
          "A failed erasure must roll back the profile too",
        );
        assert.deepEqual(
          (await c.query("SELECT * FROM course_feedback WHERE id=$1", [row.id]))
            .rows,
          beforeResponse,
        );
      } finally {
        await c.query(`DROP TRIGGER IF EXISTS "${trigger}" ON course_feedback`);
        await c.query(`DROP FUNCTION IF EXISTS "${trigger}"()`);
      }
      await eraseUser(f.employee.id);
      assert.equal(
        (
          await c.query("SELECT comment FROM course_feedback WHERE id=$1", [
            row.id,
          ])
        ).rows[0].comment,
        "",
      );
    } else if (mode === "moderator") {
      const instructorRow = (
        await c.query(
          "SELECT * FROM instructor_feedback WHERE employee_id=$1 AND course_id=$2",
          [f.employee.id, f.course],
        )
      ).rows[0];
      const reason = "MODERATOR_PRIVATE_" + randomUUID();
      await moderateFeedback(actor(f.hr), {
        kind: "course",
        id: row.id,
        expectedRevision: 1,
        hidden: true,
        excluded: false,
        reason,
        requestId: randomUUID(),
      });
      await moderateFeedback(actor(f.hr), {
        kind: "instructor",
        id: instructorRow.id,
        expectedRevision: 1,
        hidden: true,
        excluded: false,
        reason,
        requestId: randomUUID(),
      });
      // An employee edit increments the response revision without changing its last moderator.
      await saveFeedback(actor(f.employee), {
        kind: "course",
        completionId: row.completion_record_id,
        expectedRevision: 2,
        rating: 4,
        comment: "Employee's retained comment",
        requestId: randomUUID(),
      });
      await c.query("UPDATE users SET role='ADMIN' WHERE id=$1", [
        f.otherTrainer.id,
      ]);
      await moderateFeedback(
        { ...actor(f.otherTrainer), role: "ADMIN" },
        {
          kind: "instructor",
          id: instructorRow.id,
          expectedRevision: 2,
          hidden: true,
          excluded: false,
          reason: "Another moderator's retained reason",
          requestId: randomUUID(),
        },
      );
      await eraseUser(f.hr.id);
      const current = (
        await c.query(
          "SELECT comment,moderation_reason FROM course_feedback WHERE id=$1",
          [row.id],
        )
      ).rows[0];
      assert.equal(
        current.moderation_reason,
        "",
        "Erasure must scrub the current copy of a moderator's private reason",
      );
      assert.equal(current.comment, "Employee's retained comment");
      assert.equal(
        (
          await c.query(
            "SELECT moderation_reason FROM instructor_feedback WHERE id=$1",
            [instructorRow.id],
          )
        ).rows[0].moderation_reason,
        "Another moderator's retained reason",
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM feedback_revisions WHERE actor_id=$1 AND reason<>''",
            [f.hr.id],
          )
        ).rows[0].n,
        0,
      );
    } else if (mode === "self") {
      await c.query("UPDATE users SET role='INSTRUCTOR' WHERE id=$1", [
        f.employee.id,
      ]);
      await c.query(
        "UPDATE course_deliveries SET instructor_id=$1 WHERE completed_record_id=$2",
        [f.employee.id, row.completion_record_id],
      );
      const input = {
        kind: "instructor" as const,
        completionId: row.completion_record_id,
        expectedRevision: 1,
        rating: 5,
        comment: "Self evaluation",
        requestId: randomUUID(),
      };
      await assert.rejects(
        saveFeedback({ ...actor(f.employee), role: "INSTRUCTOR" }, input),
        /own instructor/,
      );
      await c.query(
        "UPDATE course_deliveries SET instructor_id=$1 WHERE completed_record_id=$2",
        [f.trainer.id, row.completion_record_id],
      );
      assert.equal(
        (
          await saveFeedback(
            { ...actor(f.employee), role: "INSTRUCTOR" },
            { ...input, requestId: randomUUID() },
          )
        ).rating,
        5,
        "Instructors can evaluate another instructor's delivered training",
      );
    } else if (mode === "digest") {
      const gate = Math.floor(Math.random() * 1_000_000_000) + 1;
      const now = new Date("2031-07-15T12:00:00Z");
      // Pause the real INSERT after report authorization, then let erasure race it.
      await c.query("SELECT pg_advisory_lock(42919,$1)", [gate]);
      await c.query(
        `CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${f.hr.id}' AND NEW.kind='course_feedback_digest' THEN PERFORM pg_advisory_xact_lock(42919,${gate}); END IF; RETURN NEW; END $$`,
      );
      await c.query(
        `CREATE TRIGGER "${trigger}" BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`,
      );
      const digest = runFeedbackDigests("month", now);
      try {
        for (let i = 0; i < 400; i++) {
          const waiting = (
            await c.query(
              "SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=42919 AND objid=$1 AND NOT granted",
              [gate],
            )
          ).rows[0].n;
          if (waiting) break;
          if (i === 399)
            throw new Error("Digest did not reach the injected race gate");
          await new Promise((r) => setTimeout(r, 25));
        }
        let erased = false;
        const erasure = eraseUser(f.hr.id).then(() => {
          erased = true;
        });
        for (let i = 0; i < 80; i++) {
          const waiting = (
            await c.query(
              "SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND objid=(hashtextextended($1,0) & 4294967295)::bigint AND NOT granted",
              [`feedback:user:${f.hr.id}`],
            )
          ).rows[0].n;
          if (erased || waiting) break;
          await new Promise((r) => setTimeout(r, 25));
        }
        await c.query("SELECT pg_advisory_unlock(42919,$1)", [gate]);
        await Promise.all([
          digest.catch((error) => {
            assert.ok(
              error.failures.every((failure: string) =>
                failure.startsWith(f.hr.id + "/"),
              ),
              "Only the raced erased recipient may lose access",
            );
          }),
          erasure,
        ]);
        assert.equal(
          (
            await c.query(
              "SELECT count(*)::int n FROM notifications WHERE user_id=$1",
              [f.hr.id],
            )
          ).rows[0].n,
          0,
          "A digest must not recreate notifications after erasure",
        );
      } finally {
        await c.query("SELECT pg_advisory_unlock(42919,$1)", [gate]);
        await digest.catch(() => {});
        await c.query(`DROP TRIGGER IF EXISTS "${trigger}" ON notifications`);
        await c.query(`DROP FUNCTION IF EXISTS "${trigger}"()`);
      }
      // Opposite ordering: actual erasure holds the user lock before the digest tries it.
      const eraseGate = gate + 1;
      await c.query("SELECT pg_advisory_lock(42919,$1)", [eraseGate]);
      await c.query(
        `CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.head.id}' AND NEW.erased_at IS NOT NULL THEN PERFORM pg_advisory_xact_lock(42919,${eraseGate}); END IF; RETURN NEW; END $$`,
      );
      await c.query(
        `CREATE TRIGGER "${trigger}" BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`,
      );
      const erasureFirst = eraseUser(f.head.id);
      let next: Promise<unknown> | undefined;
      const nextNow = new Date("2031-08-15T12:00:00Z");
      const nextPeriod = previousFeedbackPeriod("month", nextNow);
      try {
        for (let i = 0; i < 400; i++) {
          const waiting = (
            await c.query(
              "SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=42919 AND objid=$1 AND NOT granted",
              [eraseGate],
            )
          ).rows[0].n;
          if (waiting) break;
          if (i === 399)
            throw new Error("Erasure did not reach its injected gate");
          await new Promise((r) => setTimeout(r, 25));
        }
        next = runFeedbackDigests("month", nextNow);
        for (let i = 0; i < 400; i++) {
          const waiting = (
            await c.query(
              "SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND objid=(hashtextextended($1,0) & 4294967295)::bigint AND NOT granted",
              [`feedback:user:${f.head.id}`],
            )
          ).rows[0].n;
          if (waiting) break;
          if (i === 399)
            throw new Error("Digest did not wait for account erasure");
          await new Promise((r) => setTimeout(r, 25));
        }
        await c.query("SELECT pg_advisory_unlock(42919,$1)", [eraseGate]);
        await Promise.all([next, erasureFirst]);
      } finally {
        await c.query("SELECT pg_advisory_unlock(42919,$1)", [eraseGate]);
        await Promise.allSettled([next, erasureFirst]);
        await c.query(`DROP TRIGGER IF EXISTS "${trigger}" ON users`);
        await c.query(`DROP FUNCTION IF EXISTS "${trigger}"()`);
      }
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM notifications WHERE user_id=$1",
            [f.head.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM feedback_digest_runs WHERE recipient_id=$1 AND period_start=$2",
            [f.head.id, nextPeriod.start],
          )
        ).rows[0].n,
        0,
      );
    } else throw new Error("Choose atomic, moderator, self or digest");
    console.log(`PASS: feedback review ${mode}`);
  } finally {
    await c.query("ROLLBACK");
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
    await pool.end();
  }
}
run().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
