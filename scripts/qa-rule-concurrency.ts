/** Real database contracts for overlapping assignment rules. Called only inside
 * the dedicated schema-only service database owned by qa-service.ts. */
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { createPerson, withDb } from "../e2e/support";
import { db } from "../lib/db/client";
import { reevaluateUser } from "../lib/lms/rules";
import { pathPrerequisite } from "../lib/lms/path-access";

export async function runRuleConcurrency(record: (step: string, data: unknown) => void) {
  if (!new URL(process.env.DATABASE_URL!).pathname.startsWith("/welearn_service_")) throw new Error("Rule concurrency requires isolated service data");
  const learner = await createPerson("LEARNER"), rollbackLearner = await createPerson("LEARNER");
  const group = randomUUID(), course = randomUUID(), firstCourse = randomUUID(), path = randomUUID(), rules = [randomUUID(), randomUUID()].sort();
  await withDb(async client => {
    await client.query("INSERT INTO groups(id,name) VALUES($1,'QA overlapping assignments')", [group]);
    await client.query("UPDATE users SET group_ids=$2 WHERE id=ANY($1)", [[learner.id, rollbackLearner.id], JSON.stringify([group])]);
    await client.query("INSERT INTO courses(id,title,status) VALUES($1,'QA concurrent rule target','PUBLISHED')", [course]);
    await client.query("INSERT INTO courses(id,title,status) VALUES($1,'QA rule prerequisite','PUBLISHED')", [firstCourse]);
    const module = randomUUID();
    await client.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,'Prerequisite')", [module, firstCourse]);
    await client.query("INSERT INTO lessons(id,module_id,type,title,payload) VALUES($1,$2,'TEXT','Required first step',$3)", [randomUUID(), module, JSON.stringify({ body: "Complete the prerequisite before the overlapping target." })]);
    await client.query("INSERT INTO paths(id,title,complete_in_order) VALUES($1,'QA concurrent rule path',true)", [path]);
    await client.query("INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,0),($4,$2,$5,1)", [randomUUID(), path, firstCourse, randomUUID(), course]);
    await client.query("INSERT INTO enrollment_rules(id,name,criteria,target_type,target_id,active) VALUES($1,'QA direct overlapping rule',$3,'course',$4,true),($2,'QA path overlapping rule',$3,'path',$5,true)", [rules[0], rules[1], JSON.stringify({ groupId: group }), course, path]);
  });
  const rows = (userId: string) => withDb(async client => (await client.query("SELECT * FROM enrollments WHERE user_id=$1 AND course_id=$2 ORDER BY created_at", [userId, course])).rows);
  const results = await Promise.all(Array.from({ length: 10 }, () => reevaluateUser(learner.id)));
  expect(results.reduce((sum, result) => sum + result.enrolled, 0)).toBe(2);
  const initial = await rows(learner.id); expect(initial).toHaveLength(1);
  expect(initial[0].source_id).toBe(rules[0]);
  expect((await pathPrerequisite(learner.id, course))?.prerequisiteId).toBe(firstCourse);
  await withDb(client => client.query("UPDATE enrollment_rules SET active=false WHERE id=$1", [initial[0].source_id]));
  expect(await reevaluateUser(learner.id)).toEqual({ enrolled: 0, withdrawn: 0 }); expect(await rows(learner.id)).toEqual(initial);
  expect((await pathPrerequisite(learner.id, course))?.prerequisiteId).toBe(firstCourse);
  await withDb(client => client.query("UPDATE enrollment_rules SET active=false WHERE id=ANY($1)", [rules]));
  expect((await reevaluateUser(learner.id)).withdrawn).toBe(2);
  await withDb(client => client.query("UPDATE enrollment_rules SET active=true WHERE id=ANY($1)", [rules]));
  await Promise.all(Array.from({ length: 10 }, () => reevaluateUser(learner.id)));
  const after = await rows(learner.id); expect(after).toHaveLength(2); expect(after.filter(row => row.status === "NOT_STARTED")).toHaveLength(1); expect(after.find(row => row.id === initial[0].id).status).toBe("WITHDRAWN");
  record("overlapping rules serialize assignments and preserve alternate coverage", { learner: learner.id, course, firstCourse, rules, initial, after, concurrentCalls: 20, survivingPathRestriction: true });

  await expect(db.transaction(async transaction => {
    expect((await reevaluateUser(rollbackLearner.id, transaction)).enrolled).toBe(2);
    throw new Error("QA forced per-row rollback");
  })).rejects.toThrow("QA forced per-row rollback");
  expect(await rows(rollbackLearner.id)).toHaveLength(0);
  expect((await reevaluateUser(rollbackLearner.id)).enrolled).toBe(2);
  expect(await rows(rollbackLearner.id)).toHaveLength(1);
  record("rule evaluation participates in caller rollback and recovers once", { learner: rollbackLearner.id, course, recovered: await rows(rollbackLearner.id) });
}
