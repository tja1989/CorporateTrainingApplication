/** Real database contracts for overlapping assignment rules. Called only inside
 * the dedicated schema-only service database owned by qa-service.ts. */
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { createPerson, withDb } from "../e2e/support";
import { db } from "../lib/db/client";
import { reevaluateUser } from "../lib/lms/rules";

export async function runRuleConcurrency(record: (step: string, data: unknown) => void) {
  if (!new URL(process.env.DATABASE_URL!).pathname.startsWith("/welearn_service_")) throw new Error("Rule concurrency requires isolated service data");
  const learner = await createPerson("LEARNER"), rollbackLearner = await createPerson("LEARNER");
  const group = randomUUID(), course = randomUUID(), path = randomUUID(), rules = [randomUUID(), randomUUID()];
  await withDb(async client => {
    await client.query("INSERT INTO groups(id,name) VALUES($1,'QA overlapping assignments')", [group]);
    await client.query("UPDATE users SET group_ids=$2 WHERE id=ANY($1)", [[learner.id, rollbackLearner.id], JSON.stringify([group])]);
    await client.query("INSERT INTO courses(id,title,status) VALUES($1,'QA concurrent rule target','PUBLISHED')", [course]);
    await client.query("INSERT INTO paths(id,title) VALUES($1,'QA concurrent rule path')", [path]);
    await client.query("INSERT INTO path_courses(id,path_id,course_id) VALUES($1,$2,$3)", [randomUUID(), path, course]);
    await client.query("INSERT INTO enrollment_rules(id,name,criteria,target_type,target_id,active) VALUES($1,'QA direct overlapping rule',$3,'course',$4,true),($2,'QA path overlapping rule',$3,'path',$5,true)", [rules[0], rules[1], JSON.stringify({ groupId: group }), course, path]);
  });
  const rows = (userId: string) => withDb(async client => (await client.query("SELECT * FROM enrollments WHERE user_id=$1 AND course_id=$2 ORDER BY created_at", [userId, course])).rows);
  const results = await Promise.all(Array.from({ length: 10 }, () => reevaluateUser(learner.id)));
  expect(results.reduce((sum, result) => sum + result.enrolled, 0)).toBe(1);
  const initial = await rows(learner.id); expect(initial).toHaveLength(1);
  await withDb(client => client.query("UPDATE enrollment_rules SET active=false WHERE id=$1", [initial[0].source_id]));
  expect(await reevaluateUser(learner.id)).toEqual({ enrolled: 0, withdrawn: 0 }); expect(await rows(learner.id)).toEqual(initial);
  await withDb(client => client.query("UPDATE enrollment_rules SET active=false WHERE id=ANY($1)", [rules]));
  expect((await reevaluateUser(learner.id)).withdrawn).toBe(1);
  await withDb(client => client.query("UPDATE enrollment_rules SET active=true WHERE id=ANY($1)", [rules]));
  await Promise.all(Array.from({ length: 10 }, () => reevaluateUser(learner.id)));
  const after = await rows(learner.id); expect(after).toHaveLength(2); expect(after.filter(row => row.status === "NOT_STARTED")).toHaveLength(1); expect(after.find(row => row.id === initial[0].id).status).toBe("WITHDRAWN");
  record("overlapping rules serialize assignments and preserve alternate coverage", { learner: learner.id, course, rules, initial, after, concurrentCalls: 20 });

  await expect(db.transaction(async transaction => {
    expect((await reevaluateUser(rollbackLearner.id, transaction)).enrolled).toBe(1);
    throw new Error("QA forced per-row rollback");
  })).rejects.toThrow("QA forced per-row rollback");
  expect(await rows(rollbackLearner.id)).toHaveLength(0);
  expect((await reevaluateUser(rollbackLearner.id)).enrolled).toBe(1);
  expect(await rows(rollbackLearner.id)).toHaveLength(1);
  record("rule evaluation participates in caller rollback and recovers once", { learner: rollbackLearner.id, course, recovered: await rows(rollbackLearner.id) });
}
