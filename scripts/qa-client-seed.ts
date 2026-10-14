import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Client} from "pg";
import {assertLocalQa} from "../e2e/support";
import {runDeployInit} from "./deploy-init";
assertLocalQa();
if(!new URL(process.env.DATABASE_URL!).pathname.startsWith("/welearn_client_seed_"))throw new Error("Use the dedicated fictional seed database.");
async function run(){
  const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const courseId="qa-"+randomUUID();
  try{
    const roles=(await c.query("SELECT DISTINCT role FROM users ORDER BY role")).rows.map(row=>row.role);
    assert.deepEqual(roles,["ADMIN","DEPARTMENT_HEAD","HR_HEAD","INSTRUCTOR","LEARNER"]);
    assert.deepEqual((await c.query("SELECT DISTINCT type FROM lessons ORDER BY type")).rows.map(row=>row.type),["INTERVIEW","PDF","QUIZ","TEXT","VIDEO"]);
    assert.equal((await c.query("SELECT count(*)::int n FROM courses WHERE status<>'PUBLISHED' OR approval_state<>'LEGACY_PUBLISHED'")).rows[0].n,0);
    assert.equal((await c.query("SELECT count(*)::int n FROM videos WHERE ingestion_status<>'READY'")).rows[0].n,0);
    console.log("PASS: fresh fictional seed has five roles, five lesson types, complete video ingestion and compatible published courses.");
    await c.query("INSERT INTO courses(id,title,status,approval_state,content_revision,approved_revision) VALUES($1,'POS & Cash Handling','PUBLISHED','APPROVED',1,1)",[courseId]);
    await runDeployInit();
    const {rows}=await c.query("SELECT count(*)::int n FROM lessons l JOIN modules m ON m.id=l.module_id WHERE m.course_id=$1",[courseId]);
    assert.equal(rows[0].n,0,"Startup must not add content to an approved published course");
    console.log("PASS: repeat startup does not mutate published curriculum or reseed identities.");
  }finally{
    await c.query("DELETE FROM lessons WHERE module_id IN(SELECT id FROM modules WHERE course_id=$1)",[courseId]);await c.query("DELETE FROM modules WHERE course_id=$1",[courseId]);await c.query("DELETE FROM courses WHERE id=$1",[courseId]);await c.end();const {pool}=await import("../lib/db/client");await pool.end();
  }
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
