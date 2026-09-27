import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb } from "./support";
import { textCourse } from "./qualification-fixtures";
import { DEFAULT_SETTINGS } from "../lib/quiz/engine";
import { enrollUser } from "../lib/lms/rules";

test("@core Renewal gives a fresh assessment allowance and an old appealed decision cannot complete it",async({page},info)=>{
  test.setTimeout(90000);
  const learner=await createPerson("LEARNER"),admin=await createPerson("ADMIN"),f=await textCourse(learner.id,{certificate:true});
  const quiz=randomUUID(),bank=randomUUID(),question=randomUUID();
  await withDb(async db=>{
    await db.query("INSERT INTO question_banks(id,name) VALUES($1,'QA renewal assessment')",[bank]);
    await db.query("INSERT INTO questions(id,bank_id,type,status,points,body,rubric) VALUES($1,$2,'free_text','APPROVED',2,$3,$4)",[question,bank,JSON.stringify({prompt:"Explain safe renewal practice"}),JSON.stringify({criteria:[{name:"Safe practice",points:2}],modelAnswer:"Wash hands carefully before serving customers"})]);
    await db.query("INSERT INTO quizzes(id,title,lesson_id,settings,sections) VALUES($1,'QA renewable assessment',$2,$3,$4)",[quiz,f.lesson,JSON.stringify({...DEFAULT_SETTINGS,attemptsLimit:1}),JSON.stringify([{fixed:[question]}])]);
    await db.query("UPDATE lessons SET type='QUIZ',payload=$2 WHERE id=$1",[f.lesson,JSON.stringify({quizId:quiz})]);
  });
  const countCertificates=()=>withDb(async db=>(await db.query("SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",[learner.id,f.course])).rows[0].n);
  const submit=async()=>{
    await page.goto(`/quiz/${quiz}`);await page.getByRole("button",{name:"Start assessment",exact:true}).click();
    await page.getByRole("textbox",{name:"Explain safe renewal practice",exact:true}).fill("Wash hands carefully before serving customers");
    await page.getByRole("button",{name:"Submit assessment",exact:true}).click();await expect(page.getByText("Pending confirmation",{exact:true})).toBeVisible();
    return withDb(async db=>(await db.query("SELECT r.id,a.id attempt FROM grading_reviews r JOIN attempts a ON a.id=r.attempt_id WHERE a.user_id=$1 AND a.quiz_id=$2 AND r.state='PENDING' ORDER BY r.created_at DESC LIMIT 1",[learner.id,quiz])).rows[0]);
  };
  const confirm=async(id:string)=>{await page.context().clearCookies();await signIn(page,admin);await page.goto(`/admin/reviews?view=grades&item=${id}`);await Promise.all([page.waitForEvent("load"),page.getByRole("button",{name:"Confirm AI grade",exact:true}).click()]);};
  await signIn(page,learner);const first=await submit();await confirm(first.id);expect(await countCertificates()).toBe(1);
  await page.context().clearCookies();await signIn(page,learner);await page.goto(`/quiz/${quiz}`);
  await page.getByRole("button",{name:"Request human re-review of the AI-graded answers",exact:true}).click();
  await expect(page.getByText("Appeal sent — a reviewer will confirm your grade.",{exact:true})).toBeVisible();
  const oldAppeal=await withDb(async db=>(await db.query("SELECT id FROM grading_reviews WHERE attempt_id=$1 AND reason='appeal'",[first.attempt])).rows[0].id);
  const before=await withDb(async db=>({history:(await db.query("SELECT * FROM completion_records WHERE user_id=$1",[learner.id])).rows,cert:(await db.query("SELECT * FROM certificates WHERE user_id=$1",[learner.id])).rows[0]}));
  // Legacy authoring stored only the lesson payload link; it must share the
  // same renewal boundary and completion contract as explicit lesson_id.
  await withDb(db=>db.query("UPDATE quizzes SET lesson_id=NULL WHERE id=$1",[quiz]));
  // The production sweep invokes this same API-only background operation. Keep
  // its scope to this unique fixture; the full sweep is tested in qa-service.ts.
  const created=await Promise.all([1,2,3].map(()=>enrollUser(learner.id,{type:"course",id:f.course},"recert",before.cert.id,new Date(before.cert.expires_at))));
  expect(created.reduce((a,b)=>a+b,0)).toBe(1);
  await confirm(oldAppeal);expect(await countCertificates()).toBe(1);
  expect(await withDb(async db=>(await db.query("SELECT status FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2",[learner.id,f.lesson])).rows[0].status)).toBe("NOT_STARTED");
  await page.context().clearCookies();await signIn(page,learner);const second=await submit();expect(second.attempt).not.toBe(first.attempt);
  await confirm(second.id);expect(await countCertificates()).toBe(2);
  expect(await withDb(async db=>(await db.query("SELECT * FROM completion_records WHERE id=$1",[before.history[0].id])).rows[0])).toEqual(before.history[0]);
  expect(await withDb(async db=>(await db.query("SELECT serial FROM certificates WHERE id=$1",[before.cert.id])).rows[0].serial)).toBe(before.cert.serial);
  expect(await withDb(async db=>(await db.query("SELECT count(*)::int n FROM attempts WHERE quiz_id=$1 AND user_id=$2",[quiz,learner.id])).rows[0].n)).toBe(2);
  expect(await enrollUser(learner.id,{type:"course",id:f.course},"recert",before.cert.id,new Date(before.cert.expires_at))).toBe(0);
  await info.attach("renewal-records",{body:JSON.stringify({course:f.course,firstAttempt:first.attempt,secondAttempt:second.attempt,oldAppeal,originalCertificate:before.cert.id,concurrentResults:created}),contentType:"application/json"});
});

test("@core Reviewing an old oral check preserves history without completing renewed oral training",async({page})=>{
  test.setTimeout(90000);
  const learner=await createPerson("LEARNER"),admin=await createPerson("ADMIN"),f=await textCourse(learner.id,{certificate:true}),oral=randomUUID();
  await withDb(db=>db.query("INSERT INTO lessons(id,module_id,type,title,sort,payload) VALUES($1,$2,'INTERVIEW','QA renewable oral check',1,$3)",[oral,f.module,JSON.stringify({interview:{questionCount:1,maxMinutes:3,passPct:67,requirePass:true,scope:"course"}})]));
  const countCertificates=()=>withDb(async db=>(await db.query("SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",[learner.id,f.course])).rows[0].n);
  await signIn(page,learner);await page.goto(`/lesson/${f.lesson}`);await page.getByRole("button",{name:"Mark complete",exact:true}).click();
  await expect(page.getByText("Lesson complete",{exact:true})).toBeVisible();
  const answer=async(text:string)=>{await page.getByRole("textbox",{name:"Type a message",exact:true}).fill(text);await page.getByRole("button",{name:"Send",exact:true}).click();await expect(page.getByText("Your result",{exact:true})).toBeVisible();};
  await page.goto(`/lesson/${oral}`);await page.getByRole("button",{name:"Start the oral check",exact:true}).click();await answer("Read the safety procedure carefully and ask the supervisor for help before serving customers.");
  await expect.poll(countCertificates).toBe(1);
  await page.getByRole("button",{name:"Retake",exact:true}).click();await answer("No.");
  const failed=await withDb(async db=>(await db.query("SELECT id FROM live_interviews WHERE user_id=$1 AND lesson_id=$2 AND outcome='FAIL' ORDER BY started_at DESC LIMIT 1",[learner.id,oral])).rows[0].id);
  const cert=await withDb(async db=>(await db.query("SELECT * FROM certificates WHERE user_id=$1",[learner.id])).rows[0]);
  // Leave a pre-renewal interview live in this tab. Its eventual successful
  // finalization must be history only, just like a later human review.
  await page.getByRole("button",{name:"Retake",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"Type a message",exact:true})).toBeEnabled();
  await enrollUser(learner.id,{type:"course",id:f.course},"recert",cert.id,new Date(cert.expires_at));
  const renewed=await page.context().newPage();await renewed.goto(`/lesson/${f.lesson}`);await renewed.getByRole("button",{name:"Mark complete",exact:true}).click();await expect(renewed.getByText("Lesson complete",{exact:true})).toBeVisible();await renewed.close();
  await answer("Read the safety procedure carefully and ask the supervisor for help before serving customers.");
  expect(await countCertificates()).toBe(1);
  await page.context().clearCookies();await signIn(page,admin);await page.goto(`/admin/reviews?view=oral&item=${failed}`);
  await Promise.all([page.waitForEvent("load"),page.getByRole("button",{name:"Overturn to pass",exact:true}).click()]);
  expect(await countCertificates()).toBe(1);
  expect(await withDb(async db=>(await db.query("SELECT status FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2",[learner.id,oral])).rows[0].status)).toBe("NOT_STARTED");
  await page.context().clearCookies();await signIn(page,learner);await page.goto(`/lesson/${oral}`);
  await expect(page.getByText("Previous result",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Start the oral check",exact:true}).click();await answer("Read the safety procedure carefully and ask the supervisor for help before serving customers.");
  await expect.poll(countCertificates).toBe(2);
  expect(await withDb(async db=>(await db.query("SELECT count(*)::int n FROM live_interviews WHERE user_id=$1 AND lesson_id=$2",[learner.id,oral])).rows[0].n)).toBe(4);
});
