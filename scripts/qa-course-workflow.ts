import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa } from "../e2e/support";
assertLocalQa();
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const p = "qa-" + randomUUID(),
    department = p + "department",
    course = p + "course",
    trainer = p + "trainer",
    head = p + "head",
    hr = p + "hr",
    admin = p + "admin",
    module = p + "module",
    lesson = p + "lesson";
  const trainerActor = {
    id: trainer,
    role: "INSTRUCTOR" as const,
    departmentId: department,
  };
  const headActor = {
    id: head,
    role: "DEPARTMENT_HEAD" as const,
    departmentId: department,
  };
  const hrActor = { id: hr, role: "HR_HEAD" as const, departmentId: null };
  const adminActor = { id: admin, role: "ADMIN" as const, departmentId: null };
  try {
    await client.query(
      "INSERT INTO departments(id,name) VALUES($1,'QA workflow')",
      [department],
    );
    for (const [id, role, dept] of [
      [trainer, "INSTRUCTOR", department],
      [head, "DEPARTMENT_HEAD", department],
      [hr, "HR_HEAD", null],
      [admin, "ADMIN", null],
    ])
      await client.query(
        "INSERT INTO users(id,employee_id,name,role,department_id,password_state) VALUES($1,$1,'QA workflow actor',$2,$3,'ACTIVE')",
        [id, role, dept],
      );
    await client.query(
      "INSERT INTO courses(id,title,department_id,instructor_id,created_by) VALUES($1,'QA workflow course',$2,$3,$3)",
      [course, department, trainer],
    );
    await client.query(
      "INSERT INTO modules(id,course_id,title) VALUES($1,$2,'QA module')",
      [module, course],
    );
    await client.query(
      "INSERT INTO lessons(id,module_id,type,title,payload) VALUES($1,$2,'TEXT','QA lesson','{\"body\":\"Safety procedure\"}')",
      [lesson, module],
    );
    const { transitionCourse, mutateDraftCourse } = await import(
      "../lib/courses/workflow"
    );
    const request = (
      action: "submit" | "approve" | "reject" | "publish" | "override",
      revision = 1,
    ) => ({
      courseId: course,
      action,
      revision,
      requestId: randomUUID(),
      comment: action === "reject" ? "Improve content" : "",
    });
    const submit = request("submit");
    await transitionCourse(trainerActor, submit);
    await transitionCourse(trainerActor, submit);
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM course_workflow_events WHERE request_id=$1",
          [submit.requestId],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      transitionCourse(hrActor, { ...submit }),
      /request|another/i,
    );
    await assert.rejects(
      mutateDraftCourse(trainerActor, course, async () => {}),
      /withdraw|submitted/i,
    );
    const race = await Promise.allSettled([
      transitionCourse(headActor, request("approve")),
      transitionCourse(headActor, request("reject")),
    ]);
    assert.equal(
      race.filter((r) => r.status === "fulfilled").length,
      1,
      "Concurrent decisions must produce exactly one winner",
    );
    await transitionCourse(adminActor, {
      ...request("override"),
      comment: "QA reset for rollback probe",
      overrideState: "SUBMITTED",
      overridePublication: "DRAFT",
    });
    await client.query(
      `CREATE FUNCTION qa_workflow_notification_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='course_approved' AND NEW.payload->>'courseId'='${course}' THEN RAISE EXCEPTION 'QA notification rollback'; END IF; RETURN NEW; END $$`,
    );
    await client.query(
      "CREATE TRIGGER qa_workflow_notification_failure BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION qa_workflow_notification_failure()",
    );
    const before = (
      await client.query(
        "SELECT count(*)::int AS n FROM course_workflow_events WHERE course_id=$1",
        [course],
      )
    ).rows[0].n;
    await assert.rejects(
      transitionCourse(headActor, request("approve")),
      (error: unknown) =>
        String((error as { cause?: Error }).cause?.message).includes(
          "QA notification rollback",
        ),
    );
    assert.equal(
      (
        await client.query("SELECT approval_state FROM courses WHERE id=$1", [
          course,
        ])
      ).rows[0].approval_state,
      "SUBMITTED",
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM course_workflow_events WHERE course_id=$1",
          [course],
        )
      ).rows[0].n,
      before,
    );
    await client.query(
      "DROP TRIGGER qa_workflow_notification_failure ON notifications",
    );
    await client.query("DROP FUNCTION qa_workflow_notification_failure()");
    await transitionCourse(headActor, request("approve"));
    await assert.rejects(
      transitionCourse(adminActor, request("publish")),
      /HR Head/,
    );
    await transitionCourse(hrActor, request("publish"));
    await assert.rejects(
      mutateDraftCourse(trainerActor, course, async () => {}),
      /published|revise/i,
    );
    await transitionCourse(trainerActor, {
      courseId: course,
      action: "revise",
      revision: 1,
      requestId: randomUUID(),
      comment: "Update",
    });
    await mutateDraftCourse(trainerActor, course, async (tx) => {
      await tx.execute(
        (await import("drizzle-orm"))
          .sql`UPDATE lessons SET title='QA revised' WHERE id=${lesson}`,
      );
    });
    assert.deepEqual(
      (
        await client.query(
          "SELECT approval_state,content_revision,approved_revision FROM courses WHERE id=$1",
          [course],
        )
      ).rows[0],
      { approval_state: "DRAFT", content_revision: 2, approved_revision: null },
    );
    await assert.rejects(
      transitionCourse(trainerActor, request("submit")),
      /changed/,
    );
    const videoId = p + "video";
    await client.query(
      "INSERT INTO videos(id,youtube_id,title) VALUES($1,$2,'QA video')",
      [videoId, p.slice(0, 18)],
    );
    await client.query(
      "INSERT INTO lessons(id,module_id,type,title,payload) VALUES($1,$2,'VIDEO','QA video lesson',jsonb_build_object('videoId',$3::text))",
      [p + "video-lesson", module, videoId],
    );
    const { withDraftVideoWrite } = await import("../lib/courses/video-write");
    await assert.rejects(
      withDraftVideoWrite(
        videoId,
        { courseId: course, revision: 1 },
        async () => {},
      ),
      /revision|changed/i,
    );
    await withDraftVideoWrite(
      videoId,
      { courseId: course, revision: 2 },
      async (tx) => {
        await tx.execute(
          (await import("drizzle-orm"))
            .sql`UPDATE videos SET ingestion_status='READY' WHERE id=${videoId}`,
        );
      },
    );
    await transitionCourse(trainerActor, request("submit", 2));
    await assert.rejects(
      withDraftVideoWrite(
        videoId,
        { courseId: course, revision: 2 },
        async () => {},
      ),
      /submitted|approved/i,
    );
    await transitionCourse(headActor, request("approve", 2));
    await assert.rejects(
      withDraftVideoWrite(videoId, undefined, async () => {}),
      /submitted|approved/i,
    );
    await client.query(
      "INSERT INTO question_banks(id,name,course_id) VALUES($1,'QA bank',$2)",
      [p + "bank", course],
    );
    await client.query(
      'INSERT INTO questions(id,bank_id,type,body) VALUES($1,$2,\'truefalse\',\'{"prompt":"Safety first","correct":[0]}\')',
      [p + "question", p + "bank"],
    );
    const { updateDraftQuestion } = await import("../lib/courses/questions");
    await assert.rejects(
      updateDraftQuestion(hrActor, p + "question", "APPROVED"),
      /revise|approval/i,
    );
    await mutateDraftCourse(trainerActor, course, async () => {});
    await updateDraftQuestion(hrActor, p + "question", "APPROVED");
    assert.equal(
      (
        await client.query("SELECT status FROM questions WHERE id=$1", [
          p + "question",
        ])
      ).rows[0].status,
      "APPROVED",
    );
    await assert.rejects(
      updateDraftQuestion(hrActor, p + "question", "RETIRED"),
      /draft/i,
    );
    console.log(
      "PASS: duplicate request, two-person decision race, transactional notification rollback, published edit denial and revision invalidation.",
    );
  } finally {
    await client.query(
      "DROP TRIGGER IF EXISTS qa_workflow_notification_failure ON notifications",
    );
    await client.query(
      "DROP FUNCTION IF EXISTS qa_workflow_notification_failure()",
    );
    await client.query("DELETE FROM notifications WHERE user_id=ANY($1)", [
      [trainer, head, hr, admin],
    ]);
    await client.query(
      "DELETE FROM course_workflow_events WHERE course_id=$1",
      [course],
    );
    await client.query("DELETE FROM questions WHERE id=$1", [p + "question"]);
    await client.query("DELETE FROM question_banks WHERE id=$1", [p + "bank"]);
    await client.query("DELETE FROM lessons WHERE module_id=$1", [module]);
    await client.query("DELETE FROM videos WHERE id=$1", [p + "video"]);
    await client.query("DELETE FROM modules WHERE id=$1", [module]);
    await client.query("DELETE FROM courses WHERE id=$1", [course]);
    await client.query("DELETE FROM users WHERE id=ANY($1)", [
      [trainer, head, hr, admin],
    ]);
    await client.query("DELETE FROM departments WHERE id=$1", [department]);
    await client.end();
    const { pool } = await import("../lib/db/client");
    await pool.end();
  }
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
