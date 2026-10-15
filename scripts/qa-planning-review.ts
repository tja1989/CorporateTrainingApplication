/** Focused real-database regressions from the single scheduling review. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa, createPerson } from "../e2e/support";
import { db, pool } from "../lib/db/client";
import {
  DEFAULT_SETTINGS,
  finalizeReview,
  submitAttempt,
} from "../lib/quiz/engine";
import { overturnInterview } from "../lib/live/store";
import { markLessonComplete } from "../lib/lms/completion";
import { enrollUser, reevaluateUser } from "../lib/lms/rules";
import { runDailySweep } from "../lib/lms/sweep";
import { mutateDraftCourse } from "../lib/courses/workflow";
import { saveCoursePlanning } from "../lib/courses/planning-service";
import { parseCoursePlanning } from "../lib/courses/planning";
assertLocalQa();
const mode = process.argv[2];
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const instructor = await createPerson("INSTRUCTOR"),
    employee = await createPerson("LEARNER"),
    reviewer = await createPerson("ADMIN");
  const userIds = [instructor.id, employee.id, reviewer.id];
  const courses = Array.from({ length: 4 }, () => randomUUID()),
    modules = Array.from({ length: 4 }, () => randomUUID()),
    lessons = Array.from({ length: 4 }, () => randomUUID());
  const [a, b, d] = courses,
    [lesson] = lessons;
  const quiz = randomUUID(),
    bank = randomUUID(),
    question = randomUUID(),
    attempt = randomUUID(),
    review = randomUUID(),
    interview = randomUUID(),
    path = randomUUID(),
    path2 = randomUUID(),
    rule = randomUUID();
  async function open() {
    await c.query(
      "UPDATE courses SET starts_at=NULL,ends_at=NULL WHERE id=$1",
      [a],
    );
    await c.query(
      "INSERT INTO completion_records(id,user_id,course_id) VALUES($1,$2,$3)",
      [randomUUID(), employee.id, b],
    );
  }
  async function snapshot() {
    const out: Record<string, unknown> = {};
    for (const table of [
      "grading_reviews",
      "attempts",
      "live_interviews",
      "points_ledger",
      "badges",
      "lesson_progress",
      "completion_records",
      "certificates",
      "notifications",
    ]) {
      const where =
        table === "grading_reviews" ? "attempt_id=$1" : "user_id=$1";
      const key = table === "grading_reviews" ? attempt : employee.id;
      out[table] = (
        await c.query(
          `SELECT to_jsonb(r) row FROM ${table} r WHERE ${where} ORDER BY id`,
          [key],
        )
      ).rows;
    }
    return out;
  }
  try {
    for (let i = 0; i < 4; i++) {
      await c.query(
        "INSERT INTO courses(id,title,status,approval_state,instructor_id,created_by,certificate_enabled,sequential_lock) VALUES($1,$2,'PUBLISHED','LEGACY_PUBLISHED',$3,$3,true,false)",
        [courses[i], `Review ${mode} ${i}`, instructor.id],
      );
      await c.query(
        "INSERT INTO modules(id,course_id,title,sort) VALUES($1,$2,'Chapter',0)",
        [modules[i], courses[i]],
      );
      await c.query(
        "INSERT INTO lessons(id,module_id,title,type,sort,payload) VALUES($1,$2,'Review procedure','TEXT',0,$3)",
        [
          lessons[i],
          modules[i],
          JSON.stringify({
            body: "Read the procedure and ask your supervisor for help.",
          }),
        ],
      );
    }
    if (mode.startsWith("human-") || mode === "unassigned") {
      await c.query(
        "INSERT INTO course_prerequisites(course_id,required_course_id) VALUES($1,$2)",
        [a, b],
      );
      if (mode !== "unassigned")
        await c.query(
          "UPDATE courses SET starts_at='2031-10-20',ends_at='2031-10-22' WHERE id=$1",
          [a],
        );
    }
    if (mode === "human-quiz" || mode === "submission-race") {
      const rubric = {
        criteria: [{ name: "Procedure", points: 1 }],
        modelAnswer: "Read the procedure and ask your supervisor for help.",
      };
      await c.query("UPDATE lessons SET type='QUIZ',payload=$2 WHERE id=$1", [
        lesson,
        JSON.stringify({ quizId: quiz }),
      ]);
      await c.query(
        "INSERT INTO question_banks(id,name,course_id) VALUES($1,'Review bank',$2)",
        [bank, a],
      );
      await c.query(
        "INSERT INTO questions(id,bank_id,type,status,points,body,rubric) VALUES($1,$2,'free_text','APPROVED',1,$3,$4)",
        [
          question,
          bank,
          JSON.stringify({ prompt: "How should you work?" }),
          JSON.stringify(rubric),
        ],
      );
      await c.query(
        "INSERT INTO quizzes(id,lesson_id,title,settings,sections) VALUES($1,$2,'Review quiz',$3,$4)",
        [
          quiz,
          lesson,
          JSON.stringify({ ...DEFAULT_SETTINGS, attemptsLimit: 1 }),
          JSON.stringify([{ fixed: [question] }]),
        ],
      );
      await c.query(
        "INSERT INTO attempts(id,quiz_id,user_id,served_items,answers,state,grading_state) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          attempt,
          quiz,
          employee.id,
          JSON.stringify([{ questionId: question, order: 0 }]),
          JSON.stringify({
            [question]: { kind: "text", text: rubric.modelAnswer },
          }),
          mode === "human-quiz" ? "SUBMITTED" : "IN_PROGRESS",
          mode === "human-quiz" ? "PROVISIONAL" : "FINAL",
        ],
      );
      await enrollUser(
        employee.id,
        { type: "course", id: a },
        "manual",
        null,
        null,
      );
      if (mode === "human-quiz") {
        await c.query(
          "INSERT INTO grading_reviews(id,attempt_id,question_id,reason,ai_scores,state) VALUES($1,$2,$3,'low_conf',$4,'PENDING')",
          [
            review,
            attempt,
            question,
            JSON.stringify([{ criterion: "Procedure", points: 1, max: 1 }]),
          ],
        );
        const before = await snapshot();
        await assert.rejects(
          finalizeReview(review, reviewer.id, null),
          /opens|prerequisite/,
        );
        assert.deepEqual(
          await snapshot(),
          before,
          "Blocked human review must leave decisions, rewards and retry state unchanged",
        );
        await open();
        await finalizeReview(review, reviewer.id, null);
        assert.equal(
          (
            await c.query("SELECT state FROM grading_reviews WHERE id=$1", [
              review,
            ])
          ).rows[0].state,
          "CONFIRMED",
        );
        assert.equal(
          (
            await c.query(
              "SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",
              [employee.id, a],
            )
          ).rows[0].n,
          1,
        );
      } else {
        await c.query("BEGIN");
        await c.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('assessment-curriculum',0))",
        );
        const result = submitAttempt(attempt).then(
          () => ({ error: null }),
          (error) => ({ error }),
        );
        const until = Date.now() + 8000;
        let waiting = false;
        while (Date.now() < until) {
          waiting =
            (
              await c.query(
                "SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND mode='ShareLock'",
              )
            ).rows[0].n > 0;
          if (waiting) break;
          await new Promise((r) => setTimeout(r, 30));
        }
        assert.equal(
          waiting,
          true,
          "Submission must reach final shared curriculum lock",
        );
        await c.query(
          "UPDATE courses SET starts_at='2031-10-20',ends_at='2031-10-22' WHERE id=$1",
          [a],
        );
        await c.query("COMMIT");
        assert.match(String((await result).error), /opens/);
        assert.equal(
          (
            await c.query(
              "SELECT count(*)::int n FROM grading_reviews WHERE attempt_id=$1",
              [attempt],
            )
          ).rows[0].n,
          0,
          "Rejected submission must not leave orphan human reviews",
        );
        assert.equal(
          (await c.query("SELECT state FROM attempts WHERE id=$1", [attempt]))
            .rows[0].state,
          "IN_PROGRESS",
        );
      }
    } else if (mode === "human-oral") {
      await c.query(
        "UPDATE lessons SET type='INTERVIEW',payload=$2 WHERE id=$1",
        [
          lesson,
          JSON.stringify({
            interview: {
              questionCount: 1,
              maxMinutes: 3,
              passPct: 67,
              requirePass: true,
              scope: "course",
            },
          }),
        ],
      );
      await c.query(
        "INSERT INTO live_interviews(id,user_id,lesson_id,course_id,model,mock,state,outcome,score_pct,completed_at) VALUES($1,$2,$3,$4,'offline',true,'COMPLETED','FAIL',0,now())",
        [interview, employee.id, lesson, a],
      );
      await enrollUser(
        employee.id,
        { type: "course", id: a },
        "manual",
        null,
        null,
      );
      const before = await snapshot();
      await assert.rejects(
        overturnInterview(interview, reviewer.id),
        /opens|prerequisite/,
      );
      assert.deepEqual(
        await snapshot(),
        before,
        "Blocked oral review must preserve its pending action and all evidence",
      );
      await open();
      await overturnInterview(interview, reviewer.id);
      assert.equal(
        (
          await c.query("SELECT outcome FROM live_interviews WHERE id=$1", [
            interview,
          ])
        ).rows[0].outcome,
        "PASS",
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",
            [employee.id, a],
          )
        ).rows[0].n,
        1,
      );
    } else if (mode === "unassigned") {
      await enrollUser(
        employee.id,
        { type: "course", id: a },
        "manual",
        null,
        null,
      );
      await markLessonComplete(employee.id, lessons[1]);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM completion_records WHERE user_id=$1 AND course_id=$2",
            [employee.id, b],
          )
        ).rows[0].n,
        1,
        "A voluntarily completed prerequisite must create immutable evidence",
      );
      assert.equal(
        (
          await c.query(
            "SELECT source FROM enrollments WHERE user_id=$1 AND course_id=$2",
            [employee.id, b],
          )
        ).rows[0].source,
        "self",
      );
      await markLessonComplete(employee.id, lesson);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM certificates WHERE user_id=$1",
            [employee.id],
          )
        ).rows[0].n,
        2,
      );
    } else if (mode.startsWith("combined-")) {
      for (const [pathId, members] of [
        [path, [a, b]],
        [path2, [b, d]],
      ] as const) {
        await c.query(
          "INSERT INTO paths(id,title,complete_in_order) VALUES($1,'Combined review path',true)",
          [pathId],
        );
        for (const [index, courseId] of members.entries())
          await c.query(
            "INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,$4)",
            [randomUUID(), pathId, courseId, index],
          );
      }
      if (mode === "combined-assignment")
        await c.query(
          "INSERT INTO course_prerequisites(course_id,required_course_id) VALUES($1,$2)",
          [a, d],
        );
      await enrollUser(
        employee.id,
        { type: "path", id: path },
        "manual",
        null,
        null,
      );
      if (mode === "combined-assignment") {
        const before = (
          await c.query(
            "SELECT * FROM enrollments WHERE user_id=$1 ORDER BY id",
            [employee.id],
          )
        ).rows;
        await assert.rejects(
          enrollUser(
            employee.id,
            { type: "path", id: path2 },
            "manual",
            null,
            null,
          ),
          /order|path/i,
        );
        assert.deepEqual(
          (
            await c.query(
              "SELECT * FROM enrollments WHERE user_id=$1 ORDER BY id",
              [employee.id],
            )
          ).rows,
          before,
        );
      } else {
        await enrollUser(
          employee.id,
          { type: "path", id: path2 },
          "manual",
          null,
          null,
        );
        await c.query(
          "UPDATE courses SET status='DRAFT',approval_state='DRAFT' WHERE id=$1",
          [a],
        );
        await assert.rejects(
          mutateDraftCourse(
            { id: instructor.id, role: "INSTRUCTOR", departmentId: null },
            a,
            (tx) =>
              saveCoursePlanning(
                tx,
                a,
                parseCoursePlanning({
                  startDate: "",
                  endDate: "",
                  folderPath: "",
                  prerequisiteIds: [d],
                }),
              ),
            1,
          ),
          /order|path/i,
        );
      }
    } else if (mode.startsWith("cycle-")) {
      await c.query(
        "INSERT INTO paths(id,title,complete_in_order) VALUES($1,'Review ordered path',true)",
        [path],
      );
      for (let i = 0; i < 2; i++)
        await c.query(
          "INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,$4)",
          [randomUUID(), path, courses[i], i],
        );
      if (mode === "cycle-assignment") {
        await c.query(
          "INSERT INTO course_prerequisites(course_id,required_course_id) VALUES($1,$2)",
          [a, b],
        );
        await assert.rejects(
          enrollUser(
            employee.id,
            { type: "path", id: path },
            "manual",
            null,
            null,
          ),
          /order|path/i,
        );
        assert.equal(
          (
            await c.query(
              "SELECT count(*)::int n FROM enrollments WHERE user_id=$1",
              [employee.id],
            )
          ).rows[0].n,
          0,
        );
      } else {
        await c.query(
          "UPDATE courses SET status='DRAFT',approval_state='DRAFT' WHERE id=$1",
          [a],
        );
        if (mode === "cycle-indirect")
          await c.query(
            "INSERT INTO course_prerequisites(course_id,required_course_id) VALUES($1,$2)",
            [d, b],
          );
        const input = parseCoursePlanning({
          startDate: "",
          endDate: "",
          folderPath: "",
          prerequisiteIds: [mode === "cycle-indirect" ? d : b],
        });
        await assert.rejects(
          mutateDraftCourse(
            { id: instructor.id, role: "INSTRUCTOR", departmentId: null },
            a,
            (tx) => saveCoursePlanning(tx, a, input),
            1,
          ),
          /order|path/i,
        );
        assert.equal(
          (
            await c.query(
              "SELECT count(*)::int n FROM course_prerequisites WHERE course_id=$1",
              [a],
            )
          ).rows[0].n,
          0,
        );
      }
    } else if (mode === "rule-sweep") {
      const now = new Date("2031-01-01T08:00:00Z");
      await c.query("UPDATE users SET job_title=$1 WHERE id=$2", [
        rule,
        employee.id,
      ]);
      await c.query(
        "UPDATE courses SET starts_at='2031-01-31T00:00:00Z',ends_at='2031-02-28T23:00:00Z' WHERE id=$1",
        [a],
      );
      await c.query(
        "INSERT INTO paths(id,title,complete_in_order) VALUES($1,'Deferred rule path',false)",
        [path],
      );
      for (let i = 0; i < 2; i++)
        await c.query(
          "INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,$4)",
          [randomUUID(), path, courses[i], i],
        );
      await c.query(
        "INSERT INTO enrollment_rules(id,name,criteria,target_type,target_id,due_rule,active) VALUES($1,'Deferred review rule',$2,'path',$3,$4,true)",
        [
          rule,
          JSON.stringify({ jobTitle: rule }),
          path,
          JSON.stringify({ kind: "from_enrollment", days: 14 }),
        ],
      );
      await reevaluateUser(employee.id);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM enrollments WHERE user_id=$1",
            [employee.id],
          )
        ).rows[0].n,
        0,
      );
      await runDailySweep(now);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM enrollments WHERE user_id=$1",
            [employee.id],
          )
        ).rows[0].n,
        0,
      );
      await runDailySweep(new Date("2031-01-20T08:00:00Z"));
      const rows = (
        await c.query(
          "SELECT * FROM enrollments WHERE user_id=$1 ORDER BY id",
          [employee.id],
        )
      ).rows;
      assert.equal(
        rows.length,
        2,
        "Daily sweep must retry time-deferred rules without a person/rule edit",
      );
      await runDailySweep(new Date("2031-01-21T08:00:00Z"));
      assert.deepEqual(
        (
          await c.query(
            "SELECT * FROM enrollments WHERE user_id=$1 ORDER BY id",
            [employee.id],
          )
        ).rows,
        rows,
        "Retry must preserve every existing assignment byte",
      );
    } else throw new Error("Unknown review mode");
    console.log(`PASS: planning review ${mode}`);
  } finally {
    await c.query("ROLLBACK");
    await c.query("DELETE FROM grading_reviews WHERE attempt_id=$1", [attempt]);
    await c.query("DELETE FROM enrollment_rules WHERE id=$1", [rule]);
    await c.query(
      "DELETE FROM course_deliveries WHERE enrollment_id IN(SELECT id FROM enrollments WHERE user_id=ANY($1))",
      [userIds],
    );
    for (const table of [
      "certificates",
      "completion_records",
      "enrollments",
      "lesson_progress",
      "notifications",
      "points_ledger",
      "badges",
      "streak_state",
      "attempts",
      "live_interviews",
    ])
      await c.query(`DELETE FROM ${table} WHERE user_id=ANY($1)`, [userIds]);
    await c.query("DELETE FROM quizzes WHERE id=$1", [quiz]);
    await c.query("DELETE FROM questions WHERE bank_id=$1", [bank]);
    await c.query("DELETE FROM question_banks WHERE id=$1", [bank]);
    await c.query("DELETE FROM path_courses WHERE path_id=ANY($1)", [
      [path, path2],
    ]);
    await c.query("DELETE FROM paths WHERE id=ANY($1)", [[path, path2]]);
    await c.query("DELETE FROM lessons WHERE module_id=ANY($1)", [modules]);
    await c.query("DELETE FROM modules WHERE id=ANY($1)", [modules]);
    await c.query("DELETE FROM courses WHERE id=ANY($1)", [courses]);
    await c.query("DELETE FROM users WHERE id=ANY($1)", [userIds]);
    await c.end();
    await pool.end();
  }
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
