import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertLocalQa } from "../e2e/support";
assertLocalQa();
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const p = "qa-" + randomUUID();
  const head = {
      id: p + "head",
      role: "DEPARTMENT_HEAD" as const,
      departmentId: p + "a",
    },
    hr = { id: p + "hr", role: "HR_HEAD" as const, departmentId: null };
  const input = {
    target: { type: "course" as const, id: p + "course" },
    audience: { type: "group" as const, id: p + "group" },
    dueDays: 14,
  };
  const people = [
    head.id,
    hr.id,
    p + "learner-a",
    p + "learner-b",
    p + "invited",
  ];
  try {
    await c.query(
      "INSERT INTO departments(id,name) VALUES($1,'QA A'),($2,'QA B')",
      [p + "a", p + "b"],
    );
    await c.query("INSERT INTO groups(id,name) VALUES($1,'QA shared group')", [
      p + "group",
    ]);
    for (const [id, role, dept, state] of [
      [head.id, head.role, p + "a", "ACTIVE"],
      [hr.id, hr.role, null, "ACTIVE"],
      [people[2], "LEARNER", p + "a", "ACTIVE"],
      [people[3], "LEARNER", p + "b", "ACTIVE"],
      [people[4], "LEARNER", p + "a", "INVITED"],
    ])
      await c.query(
        "INSERT INTO users(id,employee_id,name,role,department_id,password_state,group_ids) VALUES($1,$1,'QA rollout',$2,$3,$4,$5)",
        [id, role, dept, state, JSON.stringify([p + "group"])],
      );
    await c.query(
      "INSERT INTO courses(id,title,status,approval_state) VALUES($1,'QA available','PUBLISHED','LEGACY_PUBLISHED'),($2,'QA draft','DRAFT','DRAFT')",
      [p + "course", p + "draft"],
    );
    await c.query("INSERT INTO paths(id,title) VALUES($1,'QA mixed path')", [
      p + "path",
    ]);
    await c.query(
      "INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,0),($4,$2,$5,1)",
      [p + "pc1", p + "path", p + "course", p + "pc2", p + "draft"],
    );
    const { rolloutTraining } = await import("../lib/courses/rollout");
    await assert.rejects(
      rolloutTraining(head, {
        ...input,
        audience: { type: "employee", id: people[3] },
      }),
      /outside/,
    );
    await assert.rejects(
      rolloutTraining(hr, {
        ...input,
        target: { type: "path", id: p + "path" },
      }),
      /published|available|approved/i,
    );
    assert.deepEqual(await rolloutTraining(head, input), {
      enrolled: 1,
      alreadyAssigned: 0,
    });
    const before = (
      await c.query(
        "SELECT due_at FROM enrollments WHERE user_id=$1 AND course_id=$2",
        [people[2], p + "course"],
      )
    ).rows[0].due_at;
    assert.deepEqual(await rolloutTraining(hr, { ...input, dueDays: 30 }), {
      enrolled: 1,
      alreadyAssigned: 1,
    });
    assert.equal(
      (
        await c.query(
          "SELECT due_at FROM enrollments WHERE user_id=$1 AND course_id=$2",
          [people[2], p + "course"],
        )
      ).rows[0].due_at.getTime(),
      before.getTime(),
    );
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM enrollments WHERE user_id=$1",
          [people[4]],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM notifications WHERE user_id=ANY($1) AND kind='enrolled'",
          [[people[2], people[3]]],
        )
      ).rows[0].n,
      2,
    );
    await c.query(
      "INSERT INTO enrollment_rules(id,name,criteria,target_type,target_id,active) VALUES($1,'QA unavailable rule',$2,'course',$3,true)",
      [p + "rule", JSON.stringify({ groupId: p + "group" }), p + "draft"],
    );
    const { reevaluateUser } = await import("../lib/lms/rules");
    await reevaluateUser(people[2]);
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM enrollments WHERE user_id=$1 AND course_id=$2",
          [people[2], p + "draft"],
        )
      ).rows[0].n,
      0,
      "Automatic rules must not create unpublished course assignments",
    );
    await c.query("UPDATE enrollments SET compliance_status='OVERDUE' WHERE user_id=ANY($1)",[[people[2],people[3]]]);
    const {runWeeklyDigest}=await import("../lib/lms/sweep");await runWeeklyDigest();
    const digest=(await c.query("SELECT payload FROM notifications WHERE user_id=$1 AND kind='manager_digest' ORDER BY sent_at DESC LIMIT 1",[head.id])).rows[0];
    assert.ok(digest,"Department Heads retain weekly digest delivery after role migration");
    assert.match(digest.payload.summary,/^1 overdue and 0 due-soon/);
    console.log(
      "PASS: department/group audience isolation, unavailable path rejection, invitation exclusion, repeat due-date preservation and deduplicated notifications.",
    );
  } finally {
    await c.query("DELETE FROM notifications WHERE user_id=ANY($1)", [people]);
    await c.query("DELETE FROM enrollments WHERE user_id=ANY($1)", [people]);
    await c.query("DELETE FROM enrollment_rules WHERE id=$1", [p + "rule"]);
    await c.query("DELETE FROM path_courses WHERE path_id=$1", [p + "path"]);
    await c.query("DELETE FROM paths WHERE id=$1", [p + "path"]);
    await c.query("DELETE FROM courses WHERE id=ANY($1)", [
      [p + "course", p + "draft"],
    ]);
    await c.query("DELETE FROM users WHERE id=ANY($1)", [people]);
    await c.query("DELETE FROM groups WHERE id=$1", [p + "group"]);
    await c.query("DELETE FROM departments WHERE id=ANY($1)", [
      [p + "a", p + "b"],
    ]);
    await c.end();
    const { pool } = await import("../lib/db/client");
    await pool.end();
  }
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
