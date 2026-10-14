import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Client} from "pg";
import {assertLocalQa} from "../e2e/support";
assertLocalQa();
const p="qa-review-"+randomUUID();
async function run(){
 const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
 const failures:string[]=[];const check=(name:string,fn:()=>void)=>{try{fn();console.log("PASS: "+name)}catch(e){failures.push(name+": "+(e as Error).message)}};
 try{
  await c.query("INSERT INTO users(id,employee_id,name,role,password_state,group_ids) VALUES($1,$1,'QA renewal','LEARNER','ACTIVE','[]'),($2,$2,'QA path','LEARNER','ACTIVE',$3)",[p+"renew",p+"path-user",JSON.stringify([p+"group"])]);
  await c.query("INSERT INTO courses(id,title,status,approval_state) VALUES($1,'QA pending','DRAFT','DRAFT'),($2,'QA successor','PUBLISHED','LEGACY_PUBLISHED'),($3,'QA independent','PUBLISHED','LEGACY_PUBLISHED')",[p+"draft",p+"ready",p+"independent"]);
  await c.query("INSERT INTO modules(id,course_id,title,sort) VALUES($1,$2,'QA module',0)",[p+"module",p+"draft"]);
  await c.query("INSERT INTO lessons(id,module_id,title,type,sort,payload) VALUES($1,$2,'QA lesson','TEXT',0,$3)",[p+"lesson",p+"module",JSON.stringify({body:"Existing content"})]);
  await c.query("INSERT INTO lesson_progress(id,user_id,lesson_id,status) VALUES($1,$2,$3,'COMPLETED')",[p+"progress",p+"renew",p+"lesson"]);
  await c.query("INSERT INTO enrollments(id,user_id,course_id,source,status,completed_at) VALUES($1,$2,$3,'manual','COMPLETED',now())",[p+"old",p+"renew",p+"draft"]);
  await c.query("INSERT INTO certificates(id,user_id,course_id,kind,serial,issued_at,expires_at) VALUES($1,$2,$3,'internal',$1,now()-interval '1 year',now()+interval '3 days')",[p+"cert",p+"renew",p+"draft"]);
  await c.query("INSERT INTO paths(id,title,complete_in_order) VALUES($1,'QA ordered',true)",[p+"path"]);
  await c.query("INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,0),($4,$2,$5,1)",[p+"pc1",p+"path",p+"draft",p+"pc2",p+"ready"]);
  await c.query("INSERT INTO enrollment_rules(id,name,criteria,target_type,target_id,active) VALUES($1,'QA path',$2,'path',$3,true),($4,'QA independent',$2,'course',$5,true)",[p+"rule",JSON.stringify({groupId:p+"group"}),p+"path",p+"ind-rule",p+"independent"]);
  const {reevaluateUser}=await import("../lib/lms/rules");await reevaluateUser(p+"path-user");
  const assignments=(await c.query("SELECT course_id FROM enrollments WHERE user_id=$1",[p+"path-user"])).rows.map(r=>r.course_id);
  check("unavailable path creates no partial assignments while independent valid rule remains",()=>assert.deepEqual(assignments,[p+"independent"]));
  const {runDailySweep}=await import("../lib/lms/sweep");await runDailySweep();
  const cert=(await c.query("SELECT recert_triggered_at FROM certificates WHERE id=$1",[p+"cert"])).rows[0];
  const progress=(await c.query("SELECT status FROM lesson_progress WHERE id=$1",[p+"progress"])).rows[0];
  const renewed=(await c.query("SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND source='recert'",[p+"renew"])).rows[0].n;
  check("unavailable renewal stays pending and preserves completed lesson progress",()=>{assert.equal(renewed,0);assert.equal(cert.recert_triggered_at,null);assert.equal(progress.status,"COMPLETED")});
  if(!failures.length){
   await c.query("UPDATE courses SET status='PUBLISHED',approval_state='LEGACY_PUBLISHED' WHERE id=$1",[p+"draft"]);
   await Promise.all([runDailySweep(),runDailySweep()]);
   const n=(await c.query("SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND source='recert'",[p+"renew"])).rows[0].n;assert.equal(n,1);
   assert.ok((await c.query("SELECT recert_triggered_at FROM certificates WHERE id=$1",[p+"cert"])).rows[0].recert_triggered_at);
   console.log("PASS: publication makes pending renewal eligible exactly once under concurrent sweeps");
   await reevaluateUser(p+"path-user");assert.equal((await c.query("SELECT count(*)::int n FROM enrollments WHERE user_id=$1",[p+"path-user"])).rows[0].n,3);
   console.log("PASS: complete path resumes all courses once available");
  }
 }finally{
  for(const [table,column] of [["notifications","user_id"],["certificates","user_id"],["lesson_progress","user_id"],["enrollments","user_id"]])await c.query(`DELETE FROM ${table} WHERE ${column}=ANY($1)`,[[p+"renew",p+"path-user"]]);
  await c.query("DELETE FROM enrollment_rules WHERE id=ANY($1)",[[p+"rule",p+"ind-rule"]]);
  await c.query("DELETE FROM path_courses WHERE path_id=$1",[p+"path"]);await c.query("DELETE FROM paths WHERE id=$1",[p+"path"]);
  await c.query("DELETE FROM lessons WHERE id=$1",[p+"lesson"]);await c.query("DELETE FROM modules WHERE id=$1",[p+"module"]);
  await c.query("DELETE FROM courses WHERE id=ANY($1)",[[p+"draft",p+"ready",p+"independent"]]);await c.query("DELETE FROM users WHERE id=ANY($1)",[[p+"renew",p+"path-user"]]);
  await c.end();const {pool}=await import("../lib/db/client");await pool.end();
 }
 if(failures.length)throw new Error(failures.join("\n"));
}
run().catch(e=>{console.error(e.message);process.exitCode=1});
