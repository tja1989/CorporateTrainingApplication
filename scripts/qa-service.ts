/** Isolated background-job qualification. Schema only, no dev/preview mutations.
 * The sweep/queue have no UI; their consequences are inspected through real pages.
 * UI earns certificates and completes renewal. Prerequisites and clock boundaries
 * alone are injected. Keep the database and traces for inspection after each run. */
import { loadEnv } from "../lib/env";
import { Client } from "pg";
import { chromium, expect } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, createWriteStream, readFileSync } from "node:fs";
import { once } from "node:events";
import { randomUUID, createHash } from "node:crypto";
loadEnv();

async function main(){
  const source=new URL(process.env.DATABASE_URL!);
  if(!["localhost","127.0.0.1"].includes(source.hostname)||source.pathname!=="/welearn_dev")throw new Error("Service qualification must clone only the local dev schema");
  const out=process.env.QA_OUT??`.artifacts/service-${Date.now()}`;mkdirSync(out,{recursive:true});
  const name=`welearn_service_${Date.now()}`,target=new URL(source);target.pathname=`/${name}`;
  const adminUrl=new URL(source);adminUrl.pathname="/postgres";
  const control=new Client({connectionString:adminUrl.toString()});await control.connect();
  await control.query(`CREATE DATABASE ${name}`);await control.end();
  const schema=execFileSync("/opt/homebrew/opt/postgresql@16/bin/pg_dump",["--schema-only","--no-owner","--no-privileges",source.toString()],{encoding:"utf8"});
  execFileSync("/opt/homebrew/opt/postgresql@16/bin/psql",["--set","ON_ERROR_STOP=1",target.toString()],{input:schema,stdio:["pipe","ignore","pipe"]});
  process.env.DATABASE_URL=target.toString();process.env.SMTP_URL="console";process.env.QA_BASE="http://127.0.0.1:3160";
  const {createPerson,signIn,withDb}=await import("../e2e/support");
  const {textCourse}=await import("../e2e/qualification-fixtures");
  const {runDailySweep,runWeeklyDigest}=await import("../lib/lms/sweep");
  const {enqueue,claimAndRun,retryJob}=await import("../lib/jobs/queue");
  const {handlers}=await import("../lib/jobs/handlers");
  const {pool}=await import("../lib/db/client");
  const {runCompletionConcurrency}=await import("./qa-completion-concurrency");
  const {runRuleConcurrency}=await import("./qa-rule-concurrency");
  const org=randomUUID();await withDb(db=>db.query("INSERT INTO org_units(id,type,name,timezone) VALUES($1,'store','QA service store','Asia/Dubai')",[org]));
  const manager=await createPerson("MANAGER"),admin=await createPerson("ADMIN"),learner=await createPerson("LEARNER",{managerId:manager.id});
  const now=new Date();const due=new Date(now.getTime()+7*86400000);
  const f=await textCourse(learner.id,{certificate:true,dueAt:due});
  const log=createWriteStream(`${out}/server.log`);
  const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3160"],{env:{...process.env,NODE_ENV:"production",PGAPPNAME:"welearn-qa-service-runtime"},stdio:["ignore","pipe","pipe"]});server.stdout.pipe(log);server.stderr.pipe(log);
  const stopRuntime=async()=>{if(server.exitCode===null&&server.signalCode===null){const exited=once(server,"exit");server.kill("SIGKILL");await exited;}};
  const browser=await chromium.launch(),context=await browser.newContext({baseURL:process.env.QA_BASE,viewport:{width:390,height:844}}),page=await context.newPage();
  await context.tracing.start({screenshots:true,snapshots:true});
  const provenance={database:name,sourceDatabase:"welearn_dev schema only; no copied data",sourceBuildCommit:process.env.QA_BUILD_COMMIT,buildDirty:process.env.QA_BUILD_DIRTY,buildId:readFileSync(".next/BUILD_ID","utf8").trim(),sourceCheckout:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),sourceDiffSha256:createHash("sha256").update(execFileSync("git",["diff","HEAD","--","app","components","lib","package.json","package-lock.json"])).digest("hex"),baseURL:process.env.QA_BASE,browser:browser.version(),viewport:{width:390,height:844},emailTransport:"console only; synthetic addresses, no external delivery",clockMethod:"Explicit timestamps passed to background sweep only; UI requests use real local clock"};
  const evidence:{step:string;data:unknown}[]=[];const record=(step:string,data:unknown)=>{evidence.push({step,data});writeFileSync(`${out}/results.json`,JSON.stringify({...provenance,time:new Date().toISOString(),evidence},null,2));console.log(step);};
  try{
    await expect.poll(async()=>{try{return(await fetch(`${process.env.QA_BASE}/login`)).status;}catch{return 0;}},{timeout:30000}).toBe(200);
    if(process.env.QA_RULES_ONLY==="1"){await runRuleConcurrency(record);record("PASSED",{cases:["rule concurrency"]});return;}
    if(process.env.QA_CONCURRENCY_ONLY==="1"){await runCompletionConcurrency(browser,process.env.QA_BASE!,out,record,stopRuntime);record("PASSED",{cases:["completion concurrency"]});return;}
    record("initial prerequisites",{learner,manager,admin,course:f,now,due});
    const first=await runDailySweep(now);await runDailySweep(now);await runWeeklyDigest(now);await runWeeklyDigest(now);
    expect(await withDb(async db=>(await db.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='due_soon'",[learner.id])).rows[0].n)).toBe(1);
    expect(await withDb(async db=>(await db.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='manager_digest'",[manager.id])).rows[0].n)).toBe(1);
    await signIn(page,learner);await page.goto("/inbox");await expect(page.getByText("Training due soon",{exact:true})).toBeVisible();await page.screenshot({path:`${out}/due-soon.png`,fullPage:true});record("due-soon sweep and notification dedupe",first);
    const overdueTime=new Date(due.getTime()+7*86400000);await runDailySweep(overdueTime);await runDailySweep(overdueTime);
    await page.goto("/home");await expect(page.getByText("Overdue",{exact:true}).first()).toBeVisible();
    expect(await withDb(async db=>(await db.query("SELECT compliance_status FROM enrollments WHERE user_id=$1 AND course_id=$2",[learner.id,f.course])).rows[0].compliance_status)).toBe("OVERDUE");
    for(const [person,route] of [[manager,"/team/reports"],[admin,"/admin/reports"]] as const){await context.clearCookies();await signIn(page,person);await page.goto(`${route}?report=compliance&employee=${learner.employeeId}`);await expect(page.getByRole("region",{name:"Compliance matrix table",exact:true})).toContainText("OVERDUE");await page.screenshot({path:`${out}/${person.role}-overdue.png`,fullPage:true});}
    await context.clearCookies();await signIn(page,learner);
    await page.goto(`/lesson/${f.lesson}`);await page.getByRole("button",{name:"Mark complete",exact:true}).click();await expect(page.getByText("Lesson complete",{exact:true})).toBeVisible();
    const before=await withDb(async db=>({history:(await db.query("SELECT * FROM completion_records WHERE user_id=$1",[learner.id])).rows,certificate:(await db.query("SELECT * FROM certificates WHERE user_id=$1",[learner.id])).rows[0]}));
    expect(before.history).toHaveLength(1);const original=before.certificate;
    await page.goto("/profile");const download=page.waitForEvent("download");await page.getByRole("link",{name:"Download PDF",exact:true}).click();await(await download).saveAs(`${out}/earned-certificate.pdf`);
    record("overdue transition followed by actual UI completion",before);
    const leadTime=new Date(new Date(original.expires_at).getTime()-86400000);await runDailySweep(leadTime);await runDailySweep(leadTime);
    const renewal=await withDb(async db=>(await db.query("SELECT * FROM enrollments WHERE user_id=$1 AND course_id=$2 AND source='recert'",[learner.id,f.course])).rows);
    expect(renewal).toHaveLength(1);expect(new Date(renewal[0].due_at).toISOString()).toBe(new Date(original.expires_at).toISOString());
    expect(await withDb(async db=>(await db.query("SELECT * FROM completion_records WHERE user_id=$1",[learner.id])).rows)).toEqual(before.history);
    await page.goto("/inbox");await expect(page.getByText("Certificate expiring",{exact:true})).toBeVisible();
    await page.goto("/home");await expect(page.getByRole("link",{name:"Continue lesson",exact:true})).toBeVisible();
    await page.getByRole("link",{name:"Continue lesson",exact:true}).click();
    await expect(page.getByRole("button",{name:"Mark complete",exact:true})).toBeVisible();
    const expired=new Date(new Date(original.expires_at).getTime()+86400000);await runDailySweep(expired);
    expect(await withDb(async db=>(await db.query("SELECT compliance_status FROM enrollments WHERE user_id=$1 AND course_id=$2 AND source='manual'",[learner.id,f.course])).rows[0].compliance_status)).toBe("EXPIRED");
    await page.getByRole("button",{name:"Mark complete",exact:true}).click();await expect(page.getByText("Lesson complete",{exact:true})).toBeVisible();
    const after=await withDb(async db=>({history:(await db.query("SELECT * FROM completion_records WHERE user_id=$1 ORDER BY completed_at",[learner.id])).rows,certificates:(await db.query("SELECT * FROM certificates WHERE user_id=$1 ORDER BY issued_at",[learner.id])).rows,enrollments:(await db.query("SELECT * FROM enrollments WHERE user_id=$1",[learner.id])).rows}));
    expect(after.history).toHaveLength(2);expect(after.history[0]).toEqual(before.history[0]);expect(after.certificates).toHaveLength(2);expect(after.certificates[0].serial).toBe(original.serial);expect(after.enrollments.filter(e=>e.source==='recert'&&e.status==='COMPLETED')).toHaveLength(1);
    record("expiry and UI renewal preserve history",after);
    for(const [person,route] of [[manager,"/team/reports"],[admin,"/admin/reports"]] as const){await context.clearCookies();await signIn(page,person);await page.goto(`${route}?report=transcript&employee=${learner.employeeId}`);await expect(page.getByRole("region",{name:"Learner transcript table",exact:true})).toContainText(learner.employeeId);await page.screenshot({path:`${out}/${person.role}-transcript.png`,fullPage:true});}
    const doc=randomUUID();await withDb(db=>db.query("INSERT INTO policy_docs(id,title,country,audience,language,version,effective_date,owner,body,status) VALUES($1,'QA worker policy','*','all','en',1,now(),'QA','# No body','ACTIVE')",[doc]));
    const job=await enqueue("ingest_policy_doc",{docId:doc});expect(await claimAndRun(handlers)).toBe(true);
    expect(await withDb(async db=>(await db.query("SELECT state FROM jobs WHERE id=$1",[job])).rows[0].state)).toBe("failed");
    await withDb(db=>db.query("UPDATE policy_docs SET body='# Worker policy\n\n## Safe procedure\nUse the safe worker checklist.' WHERE id=$1",[doc]));await retryJob(job);expect(await claimAndRun(handlers)).toBe(true);expect(await claimAndRun(handlers)).toBe(false);
    expect(await withDb(async db=>(await db.query("SELECT state FROM jobs WHERE id=$1",[job])).rows[0].state)).toBe("done");
    await page.goto(`/policy/${doc}`);await expect(page.getByText("Use the safe worker checklist.",{exact:true})).toBeVisible();await page.screenshot({path:`${out}/worker-policy.png`,fullPage:true});record("real queue handler failure and retry",{job,doc,state:"done"});
    await runRuleConcurrency(record);
    await runCompletionConcurrency(browser,process.env.QA_BASE!,out,record,stopRuntime);
    record("PASSED",{cases:["completion concurrency","due transitions","reminder dedupe","weekly manager digest","earned PDF","recert once","expiry","renewal UI","immutable history","both-role reports","worker failure/retry"]});
  }catch(error){record("FAILED",String(error));throw error;}finally{await context.tracing.stop({path:`${out}/trace.zip`});await browser.close();server.kill("SIGTERM");await Promise.race([once(server,"exit"),new Promise(resolve=>setTimeout(resolve,2000))]);if(server.exitCode===null)server.kill("SIGKILL");await pool.end();log.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
