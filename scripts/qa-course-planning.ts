import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa, createPerson } from "../e2e/support";
import { canonicalRole } from "../lib/auth/roles";
import { db, pool } from "../lib/db/client";
import { parseCoursePlanning } from "../lib/courses/planning";
import { saveCoursePlanning } from "../lib/courses/planning-service";
import {
  mutateDraftCourse,
  lockAssessmentCurriculum,
} from "../lib/courses/workflow";
import { coursePlanningAccess } from "../lib/lms/planning-access";
import { learnerLesson } from "../lib/lms/lesson-access";
import { enrollUser, reevaluateUser } from "../lib/lms/rules";
import { tryCertificateRenewal } from "../lib/lms/sweep";
import { markLessonComplete } from "../lib/lms/completion";
import { ownFeedback, saveFeedback } from "../lib/feedback/service";
import {
  DEFAULT_SETTINGS,
  startAttempt,
  saveAnswers,
  submitAttempt,
} from "../lib/quiz/engine";
import { createInterview, completeInterview } from "../lib/live/store";
import { t } from "../lib/db/client";
import { eq } from "drizzle-orm";

assertLocalQa();
const mode = process.argv[2] ?? "context";
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const instructor = await createPerson("INSTRUCTOR"),
    employee = await createPerson("LEARNER"),
    other = await createPerson("LEARNER"),
    outsider = await createPerson("INSTRUCTOR");
  const a = randomUUID(),
    b = randomUUID(),
    path = randomUUID(),
    lessonA = randomUUID(),
    lessonB = randomUUID(),
    moduleA = randomUUID(),
    moduleB = randomUUID();
  const quizId = randomUUID(),
    bankId = randomUUID(),
    questionId = randomUUID();
  const ruleId = randomUUID();
  const actor = (p: typeof instructor) => ({
    id: p.id,
    role: canonicalRole(p.role)!,
    departmentId: p.departmentId,
  });
  const input = parseCoursePlanning({
    startDate: "2031-10-20",
    endDate: "2031-10-22",
    folderPath: "Operations/Safety",
    prerequisiteIds: [b],
  });
  async function openFixture() {
    // Controlled prerequisite evidence and published schedule isolate service boundaries.
    await c.query(
      "UPDATE courses SET starts_at='2020-01-01Z',ends_at='2020-01-02Z' WHERE id=$1",
      [a],
    );
    await c.query(
      "INSERT INTO completion_records(id,user_id,course_id) VALUES($1,$2,$3)",
      [randomUUID(), employee.id, b],
    );
  }
  try {
    await c.query(
      "INSERT INTO courses(id,title,status,approval_state,content_revision,approved_revision,instructor_id,created_by,certificate_enabled) VALUES($1,'Planning target','DRAFT','APPROVED',2,2,$3,$3,true),($2,'Planning prerequisite','PUBLISHED','LEGACY_PUBLISHED',1,NULL,$3,$3,true)",
      [a, b, instructor.id],
    );
    await c.query(
      "INSERT INTO modules(id,course_id,title,sort) VALUES($1,$2,'Target',0),($3,$4,'Prerequisite',0)",
      [moduleA, a, moduleB, b],
    );
    await c.query(
      "INSERT INTO lessons(id,module_id,title,type,sort,payload) VALUES($1,$2,'Target lesson','TEXT',0,'{\"body\":\"Training content\"}'),($3,$4,'Prerequisite lesson','TEXT',0,'{\"body\":\"Required content\"}')",
      [lessonA, moduleA, lessonB, moduleB],
    );
    await assert.rejects(
      mutateDraftCourse(
        actor(outsider),
        a,
        (tx) => saveCoursePlanning(tx, a, input),
        2,
      ),
      /cannot edit/,
    );
    await mutateDraftCourse(
      actor(instructor),
      a,
      (tx) => saveCoursePlanning(tx, a, input),
      2,
    );
    const revision = (await c.query("SELECT * FROM courses WHERE id=$1", [a]))
      .rows[0];
    assert.equal(revision.approval_state, "DRAFT");
    assert.equal(revision.approved_revision, null);
    assert.equal(revision.content_revision, 3);
    await assert.rejects(
      mutateDraftCourse(
        actor(instructor),
        a,
        (tx) => saveCoursePlanning(tx, a, input),
        2,
      ),
      /changed/,
    );
    // Published fixture state isolates planning access; browser qualification owns actual approval/publication actions.
    await c.query(
      "UPDATE courses SET status='PUBLISHED',approval_state='APPROVED',approved_revision=content_revision WHERE id=$1",
      [a],
    );
    if (mode === "context") {
      assert.equal((await coursePlanningAccess(employee.id, a)).blocked, true);
      assert.equal(
        (await learnerLesson(employee.id, lessonA))?.self.locked,
        true,
      );
      assert.equal(
        (
          await coursePlanningAccess(
            employee.id,
            a,
            db,
            new Date("2031-10-19T20:00Z"),
          )
        ).blocked,
        true,
      );
      const completion = randomUUID();
      await c.query(
        "INSERT INTO completion_records(id,user_id,course_id) VALUES($1,$2,$3)",
        [completion, employee.id, b],
      );
      assert.deepEqual(
        await coursePlanningAccess(
          employee.id,
          a,
          db,
          new Date("2031-10-19T20:00Z"),
        ),
        { blocked: false },
      );
      await c.query("UPDATE courses SET status='ARCHIVED' WHERE id=$1", [b]);
      assert.deepEqual(
        await coursePlanningAccess(
          employee.id,
          a,
          db,
          new Date("2031-10-19T20:00Z"),
        ),
        { blocked: false },
      );
      assert.equal(
        (
          await coursePlanningAccess(
            other.id,
            a,
            db,
            new Date("2031-10-19T20:00Z"),
          )
        ).blocked,
        true,
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM completion_records WHERE id=$1",
            [completion],
          )
        ).rows[0].n,
        1,
      );
      await c.query(
        "UPDATE courses SET status='DRAFT',title='PRIVATE next prerequisite revision' WHERE id=$1",
        [b],
      );
      const restricted = await coursePlanningAccess(
        other.id,
        a,
        db,
        new Date("2031-10-19T20:00Z"),
      );
      assert.ok(
        !JSON.stringify(restricted).includes("PRIVATE"),
        "A prerequisite gate must not reveal a new unpublished course title",
      );
    } else if (mode === "credit") {
      await enrollUser(
        employee.id,
        { type: "course", id: a },
        "manual",
        null,
        null,
      );
      await assert.rejects(markLessonComplete(employee.id, lessonA), /opens/i);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2",
            [employee.id, lessonA],
          )
        ).rows[0].n,
        0,
      );
      await c.query(
        "UPDATE courses SET starts_at='2020-01-01Z',ends_at='2020-01-02Z' WHERE id=$1",
        [a],
      );
      await assert.rejects(
        markLessonComplete(employee.id, lessonA),
        /prerequisite/i,
      );
      await enrollUser(
        employee.id,
        { type: "course", id: b },
        "manual",
        null,
        null,
      );
      await markLessonComplete(employee.id, lessonB);
      await markLessonComplete(employee.id, lessonA);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",
            [employee.id, a],
          )
        ).rows[0].n,
        1,
      );
      await enrollUser(
        other.id,
        { type: "course", id: a },
        "manual",
        null,
        null,
      );
      const overdue = (
        await c.query(
          "SELECT due_at,compliance_status FROM enrollments WHERE user_id=$1 AND course_id=$2",
          [other.id, a],
        )
      ).rows[0];
      assert.equal(overdue.due_at.toISOString(), "2020-01-02T00:00:00.000Z");
      assert.equal(overdue.compliance_status, "OVERDUE");
    } else if (mode === "enrollment") {
      await c.query("INSERT INTO paths(id,title) VALUES($1,'Planning path')", [
        path,
      ]);
      await c.query(
        "INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,0),($4,$2,$5,1)",
        [randomUUID(), path, b, randomUUID(), a],
      );
      await assert.rejects(
        enrollUser(
          employee.id,
          { type: "path", id: path },
          "path",
          path,
          new Date("2026-10-22Z"),
        ),
        /deadline/i,
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=ANY($2)",
            [employee.id, [a, b]],
          )
        ).rows[0].n,
        0,
      );
      await enrollUser(
        employee.id,
        { type: "path", id: path },
        "path",
        path,
        new Date("2031-10-22Z"),
      );
      const original = (
        await c.query(
          "SELECT * FROM enrollments WHERE user_id=$1 AND course_id=ANY($2) ORDER BY id",
          [employee.id, [a, b]],
        )
      ).rows;
      assert.equal(
        await enrollUser(
          employee.id,
          { type: "path", id: path },
          "path",
          path,
          new Date("2026-10-22Z"),
        ),
        0,
        "A duplicate assignment must preserve its already valid deadlines",
      );
      assert.deepEqual(
        (
          await c.query(
            "SELECT * FROM enrollments WHERE user_id=$1 AND course_id=ANY($2) ORDER BY id",
            [employee.id, [a, b]],
          )
        ).rows,
        original,
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=ANY($2)",
            [employee.id, [a, b]],
          )
        ).rows[0].n,
        2,
      );
    } else if (mode === "automatic") {
      await c.query(
        "INSERT INTO paths(id,title) VALUES($1,'Planning automatic path')",
        [path],
      );
      await c.query(
        "INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,0),($4,$2,$5,1)",
        [randomUUID(), path, b, randomUUID(), a],
      );
      await c.query("UPDATE users SET group_ids=$2 WHERE id=$1", [
        employee.id,
        JSON.stringify([ruleId]),
      ]);
      await c.query(
        "INSERT INTO enrollment_rules(id,name,criteria,target_type,target_id,due_rule) VALUES($1,'Planning rule',$2,'path',$3,$4)",
        [
          ruleId,
          JSON.stringify({ groupId: ruleId }),
          path,
          JSON.stringify({ kind: "from_enrollment", days: 14 }),
        ],
      );
      await reevaluateUser(employee.id);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=ANY($2)",
            [employee.id, [a, b]],
          )
        ).rows[0].n,
        0,
      );
      await c.query("UPDATE enrollment_rules SET due_rule=$2 WHERE id=$1", [
        ruleId,
        JSON.stringify({ kind: "fixed", date: "2031-10-22" }),
      ]);
      await reevaluateUser(employee.id);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=ANY($2)",
            [employee.id, [a, b]],
          )
        ).rows[0].n,
        2,
      );
    } else if (mode === "renewal") {
      await openFixture();
      await enrollUser(
        employee.id,
        { type: "course", id: a },
        "manual",
        null,
        null,
      );
      await markLessonComplete(employee.id, lessonA);
      const cert = (
        await c.query(
          "SELECT * FROM certificates WHERE user_id=$1 AND course_id=$2",
          [employee.id, a],
        )
      ).rows[0];
      const expiry = new Date(Date.now() + 7 * 86400000);
      await c.query("UPDATE certificates SET expires_at=$2 WHERE id=$1", [
        cert.id,
        expiry,
      ]);
      const history = (
        await c.query(
          "SELECT * FROM completion_records WHERE user_id=$1 ORDER BY id",
          [employee.id],
        )
      ).rows;
      const progress = (
        await c.query(
          "SELECT * FROM lesson_progress WHERE user_id=$1 ORDER BY id",
          [employee.id],
        )
      ).rows;
      await c.query(
        "UPDATE courses SET starts_at='2031-10-20Z',ends_at='2031-10-22Z' WHERE id=$1",
        [a],
      );
      assert.equal(await tryCertificateRenewal(cert.id), false);
      assert.deepEqual(
        (
          await c.query(
            "SELECT * FROM lesson_progress WHERE user_id=$1 ORDER BY id",
            [employee.id],
          )
        ).rows,
        progress,
      );
      assert.equal(
        (
          await c.query(
            "SELECT recert_triggered_at FROM certificates WHERE id=$1",
            [cert.id],
          )
        ).rows[0].recert_triggered_at,
        null,
      );
      const oldCompletion = history.find((row) => row.course_id === a);
      await saveFeedback(actor(employee), {
        kind: "course",
        completionId: oldCompletion.id,
        rating: 5,
        comment: "Historical course response",
        expectedRevision: 0,
        requestId: randomUUID(),
      });
      assert.equal(
        (await ownFeedback(employee.id, oldCompletion.id)).course?.comment,
        "Historical course response",
      );
      await c.query("UPDATE courses SET starts_at='2020-01-01Z' WHERE id=$1", [
        a,
      ]);
      assert.equal(await tryCertificateRenewal(cert.id), true);
      assert.equal(await tryCertificateRenewal(cert.id), false);
      assert.deepEqual(
        (
          await c.query(
            "SELECT * FROM completion_records WHERE user_id=$1 ORDER BY id",
            [employee.id],
          )
        ).rows,
        history,
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND source='recert' AND source_id=$2",
            [employee.id, cert.id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await c.query(
            "SELECT status FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2",
            [employee.id, lessonA],
          )
        ).rows[0].status,
        "NOT_STARTED",
      );
      await enrollUser(
        employee.id,
        { type: "course", id: b },
        "manual",
        null,
        null,
      );
      await markLessonComplete(employee.id, lessonB);
      const prerequisiteCertificate = (
        await c.query(
          "SELECT id FROM certificates WHERE user_id=$1 AND course_id=$2",
          [employee.id, b],
        )
      ).rows[0].id;
      await enrollUser(
        employee.id,
        { type: "course", id: b },
        "recert",
        prerequisiteCertificate,
        new Date("2031-11-01Z"),
      );
      assert.equal(
        (
          await c.query(
            "SELECT status FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2",
            [employee.id, lessonB],
          )
        ).rows[0].status,
        "NOT_STARTED",
      );
      assert.deepEqual(
        await coursePlanningAccess(employee.id, a),
        { blocked: false },
        "Renewing a prerequisite must not erase its immutable completion proof",
      );
    } else if (mode === "race") {
      await openFixture();
      await enrollUser(
        employee.id,
        { type: "course", id: a },
        "manual",
        null,
        null,
      );
      await c.query("BEGIN");
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('assessment-curriculum',0))",
      );
      await c.query(
        "UPDATE courses SET starts_at='2031-10-20Z',ends_at='2031-10-22Z' WHERE id=$1",
        [a],
      );
      const credit = markLessonComplete(employee.id, lessonA);
      credit.catch(() => {});
      try {
        let waiting = false;
        for (let n = 0; n < 200; n++) {
          waiting =
            (
              await c.query(
                "SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND mode='ShareLock' AND NOT granted",
              )
            ).rows[0].n > 0;
          if (waiting) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(
          waiting,
          true,
          "Learning must wait for the course-setting transaction",
        );
        await c.query("COMMIT");
        await assert.rejects(credit, /opens/i);
        assert.equal(
          (
            await c.query(
              "SELECT count(*)::int n FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2",
              [employee.id, lessonA],
            )
          ).rows[0].n,
          0,
        );
      } finally {
        await c.query("ROLLBACK");
        await credit.catch(() => {});
      }
    } else if (mode.startsWith("quiz-")) {
      await c.query(
        "INSERT INTO question_banks(id,name,course_id) VALUES($1,'Planning quiz bank',$2)",
        [bankId, a],
      );
      await c.query(
        "INSERT INTO questions(id,bank_id,type,status,body) VALUES($1,$2,'truefalse','APPROVED',$3)",
        [
          questionId,
          bankId,
          JSON.stringify({ prompt: "Follow the procedure?", correct: [0] }),
        ],
      );
      await c.query(
        "INSERT INTO quizzes(id,lesson_id,title,settings,sections) VALUES($1,$2,'Planning quiz',$3,$4)",
        [
          quizId,
          lessonA,
          JSON.stringify(DEFAULT_SETTINGS),
          JSON.stringify([{ fixed: [questionId] }]),
        ],
      );
      const [quiz] = await db
        .select()
        .from(t.quizzes)
        .where(eq(t.quizzes.id, quizId));
      await c.query("UPDATE lessons SET type='QUIZ',payload=$2 WHERE id=$1", [
        lessonA,
        JSON.stringify({ quizId }),
      ]);
      if (mode === "quiz-start") {
        await assert.rejects(
          startAttempt(quiz, { id: employee.id, timeMultiplier: 1 }),
          /opens/i,
        );
        await openFixture();
        const started = await startAttempt(quiz, {
          id: employee.id,
          timeMultiplier: 1,
        });
        assert.equal(started.state, "IN_PROGRESS");
        assert.equal(started.servedItems.length, 1);
      } else {
        const attemptId = randomUUID();
        await c.query(
          "INSERT INTO attempts(id,quiz_id,user_id,served_items,answers,state) VALUES($1,$2,$3,$4,'{}','IN_PROGRESS')",
          [
            attemptId,
            quizId,
            employee.id,
            JSON.stringify([{ questionId, order: 0 }]),
          ],
        );
        const [attempt] = await db
          .select()
          .from(t.attempts)
          .where(eq(t.attempts.id, attemptId));
        if (mode === "quiz-save")
          await assert.rejects(
            saveAnswers(attempt, quiz, {
              [questionId]: { kind: "choice", selected: [0] },
            }),
            /opens/i,
          );
        else await assert.rejects(submitAttempt(attemptId), /opens/i);
        assert.equal(
          (await c.query("SELECT state FROM attempts WHERE id=$1", [attemptId]))
            .rows[0].state,
          "IN_PROGRESS",
        );
        await openFixture();
        await enrollUser(
          employee.id,
          { type: "course", id: a },
          "manual",
          null,
          null,
        );
        await saveAnswers(attempt, quiz, {
          [questionId]: { kind: "choice", selected: [0] },
        });
        assert.deepEqual(
          (
            await c.query("SELECT answers FROM attempts WHERE id=$1", [
              attemptId,
            ])
          ).rows[0].answers,
          { [questionId]: { kind: "choice", selected: [0] } },
        );
        if (mode === "quiz-submit") {
          const graded = await submitAttempt(attemptId);
          assert.equal(graded.state, "GRADED");
          assert.equal(graded.passed, true);
          assert.equal(
            (
              await c.query(
                "SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",
                [employee.id, a],
              )
            ).rows[0].n,
            1,
          );
        }
      }
    } else if (mode.startsWith("oral-")) {
      const args = {
        userId: employee.id,
        lessonId: lessonA,
        courseId: a,
        model: "offline",
        mock: true,
        questionCount: 1,
        maxMinutes: 3,
        passPct: 67,
      };
      if (mode === "oral-create") {
        await assert.rejects(createInterview(args), /opens/i);
        await openFixture();
        const created = await createInterview(args);
        assert.equal(
          (
            await c.query("SELECT state FROM live_interviews WHERE id=$1", [
              created,
            ])
          ).rows[0].state,
          "IN_PROGRESS",
        );
      } else {
        const interviewId = randomUUID();
        await c.query(
          "INSERT INTO live_interviews(id,user_id,lesson_id,course_id,model,mock) VALUES($1,$2,$3,$4,'offline',true)",
          [interviewId, employee.id, lessonA, a],
        );
        await assert.rejects(
          completeInterview(
            interviewId,
            {
              questions: [
                {
                  question: "What should you do?",
                  answer_summary: "Follow the procedure",
                  score: 2,
                  feedback: "Correct",
                },
              ],
              overall_summary: "Passed",
            },
            "mock",
          ),
          /opens/i,
        );
        assert.equal(
          (
            await c.query("SELECT state FROM live_interviews WHERE id=$1", [
              interviewId,
            ])
          ).rows[0].state,
          "IN_PROGRESS",
        );
        await openFixture();
        await c.query(
          "UPDATE lessons SET type='INTERVIEW',payload='{}' WHERE id=$1",
          [lessonA],
        );
        await enrollUser(
          employee.id,
          { type: "course", id: a },
          "manual",
          null,
          null,
        );
        await completeInterview(
          interviewId,
          {
            questions: [
              {
                question: "What should you do?",
                answer_summary: "Follow the procedure",
                score: 2,
                feedback: "Correct",
              },
            ],
            overall_summary: "Passed",
          },
          "mock",
        );
        assert.equal(
          (
            await c.query("SELECT state FROM live_interviews WHERE id=$1", [
              interviewId,
            ])
          ).rows[0].state,
          "COMPLETED",
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
      }
    } else if (mode === "graph") {
      await c.query("DELETE FROM course_prerequisites WHERE course_id=$1", [a]);
      const save = (id: string, required: string) =>
        db.transaction(async (tx) => {
          await lockAssessmentCurriculum(tx);
          await saveCoursePlanning(tx, id, {
            startsAt: null,
            endsAt: null,
            folderPath: "",
            prerequisiteIds: [required],
          });
        });
      // Exercises the graph service under the same serialized transaction as authoring.
      const result = await Promise.allSettled([save(a, b), save(b, a)]);
      assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM course_prerequisites WHERE course_id=ANY($1)",
            [[a, b]],
          )
        ).rows[0].n,
        1,
      );
    } else throw new Error("Choose context, credit, enrollment or graph");
    console.log(`PASS: actual course planning ${mode}`);
  } finally {
    await c.query("ROLLBACK");
    const ids = [instructor, employee, other, outsider].map((p) => p.id);
    await c.query("DELETE FROM enrollment_rules WHERE id=$1", [ruleId]);
    await c.query(
      "DELETE FROM course_deliveries WHERE enrollment_id IN(SELECT id FROM enrollments WHERE user_id=ANY($1))",
      [ids],
    );
    for (const table of ["certificates", "completion_records", "enrollments"])
      await c.query(`DELETE FROM ${table} WHERE user_id=ANY($1)`, [ids]);
    await c.query(
      "DELETE FROM feedback_revisions WHERE response_id IN(SELECT id FROM course_feedback WHERE course_id=ANY($1) UNION SELECT id FROM instructor_feedback WHERE course_id=ANY($1))",
      [[a, b]],
    );
    for (const table of [
      "course_feedback",
      "instructor_feedback",
      "course_deliveries",
      "certificates",
      "completion_records",
      "enrollments",
    ])
      await c.query(`DELETE FROM ${table} WHERE course_id=ANY($1)`, [[a, b]]);
    await c.query("DELETE FROM lesson_progress WHERE user_id=ANY($1)", [ids]);
    await c.query("DELETE FROM lessons WHERE module_id=ANY($1)", [
      [moduleA, moduleB],
    ]);
    await c.query("DELETE FROM modules WHERE id=ANY($1)", [[moduleA, moduleB]]);
    await c.query("DELETE FROM path_courses WHERE path_id=$1", [path]);
    await c.query("DELETE FROM paths WHERE id=$1", [path]);
    await c.query("DELETE FROM courses WHERE id=ANY($1)", [[a, b]]);
    for (const table of [
      "notifications",
      "points_ledger",
      "badges",
      "streak_state",
      "attempts",
      "live_interviews",
    ])
      await c.query(`DELETE FROM ${table} WHERE user_id=ANY($1)`, [ids]);
    await c.query("DELETE FROM quizzes WHERE id=$1", [quizId]);
    await c.query("DELETE FROM questions WHERE bank_id=$1", [bankId]);
    await c.query("DELETE FROM question_banks WHERE id=$1", [bankId]);
    await c.query("DELETE FROM users WHERE id=ANY($1)", [ids]);
    await c.end();
    await pool.end();
  }
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
