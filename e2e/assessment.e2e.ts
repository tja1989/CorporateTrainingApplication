import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, expectNoPageOverflow, capture } from "./support";
import { DEFAULT_SETTINGS } from "../lib/quiz/engine";

async function assessmentFixture() {
  const quiz = randomUUID(), bank = randomUUID();
  const questions = [
    { type: "mcq_single", body: { prompt: "Choose the safe greeting", options: ["Hello", "Ignore"], correct: [0] } },
    { type: "mcq_multi", body: { prompt: "Choose the safety checks", options: ["Wash", "Clean", "Skip"], correct: [0, 1] } },
    { type: "truefalse", body: { prompt: "Clean hands protect customers", correct: [0] } },
    { type: "fill_blank", body: { prompt: "Name the greeting", acceptedAnswers: ["Hello"] } },
    { type: "matching", body: { prompt: "Match the task", pairs: [{ left: "Hands", right: "Wash" }, { left: "Counter", right: "Clean" }] } },
    { type: "ordering", body: { prompt: "Order the steps", orderItems: ["Wet", "Wash", "Dry"] } },
    { type: "free_text", body: { prompt: "Explain safe service" } },
  ];
  const ids = questions.map(() => randomUUID());
  await withDb(async db => {
    await db.query("INSERT INTO question_banks (id,name) VALUES ($1,'QA assessment bank')", [bank]);
    for (let i = 0; i < questions.length; i++) await db.query("INSERT INTO questions (id,bank_id,type,status,body) VALUES ($1,$2,$3,'APPROVED',$4)", [ids[i], bank, questions[i].type, JSON.stringify(questions[i].body)]);
    await db.query("INSERT INTO quizzes (id,title,settings,sections) VALUES ($1,'QA seven question assessment',$2,$3)", [quiz, JSON.stringify({ ...DEFAULT_SETTINGS, shuffleQuestions: false, shuffleChoices: false }), JSON.stringify([{ fixed: ids }])]);
  });
  return quiz;
}

test("@core @template All seven question types support accessible input and unanswered submission confirmation", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  const quiz = await assessmentFixture();
  await signIn(page, person);
  await page.goto(`/quiz/${quiz}`);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await page.getByRole("radio", { name: "Hello", exact: true }).check();
  await page.getByRole("checkbox", { name: "Wash", exact: true }).check();
  await page.getByRole("checkbox", { name: "Clean", exact: true }).check();
  await page.getByRole("radio", { name: "True", exact: true }).check();
  await page.getByRole("textbox", { name: "Name the greeting" }).fill("Hello");
  await page.getByLabel("Match for Hands").selectOption("0");
  await page.getByLabel("Match for Counter").selectOption("1");
  await page.getByRole("button", { name: "Use this order", exact: true }).click();
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Submit with unanswered questions?" });
  await expect(confirmation).toContainText("1 question(s) are unanswered");
  await confirmation.getByRole("button", { name: "Keep answering" }).click();
  await page.getByRole("textbox", { name: "Explain safe service" }).fill("Welcome customers and wash hands before serving.");
  await expectNoPageOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, info, "seven-question-types");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await expect(page.getByText("Final result: passed", { exact: true })).toBeVisible();
});

test("@core Failed answer save retains typed input and blocks stale submission until retry", async ({ page }) => {
  const person = await createPerson("LEARNER");
  const quiz = await assessmentFixture();
  await signIn(page, person);
  await page.goto(`/quiz/${quiz}`);
  await page.getByRole("button", { name: "Start assessment" }).click();
  const answer = page.getByRole("textbox", { name: "Name the greeting" });
  await answer.fill("Hello");
  let submissions = 0;
  await page.route("**/api/attempt/*", async route => {
    if (route.request().method() === "PATCH") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary save failure" }) });
    if (route.request().method() === "POST") submissions++;
    return route.continue();
  });
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Temporary save failure");
  await expect(answer).toHaveValue("Hello");
  expect(submissions).toBe(0);
  await page.unroute("**/api/attempt/*");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByText("Final result: not passed", { exact: true })).toBeVisible();
});

test("@core Provisional results remain pending and never claim a final pass", async ({ page }) => {
  const person = await createPerson("LEARNER");
  const quiz = await assessmentFixture();
  await withDb(db => db.query("INSERT INTO attempts (id,user_id,quiz_id,state,grading_state,served_items,score,max_score,passed) VALUES ($1,$2,$3,'SUBMITTED','PROVISIONAL','[]',9,10,true)", [randomUUID(), person.id, quiz]));
  await signIn(page, person);
  await page.goto(`/quiz/${quiz}`);
  await expect(page.getByText("Pending confirmation", { exact: true })).toBeVisible();
  await expect(page.getByText("Passed", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request human re-review of the AI-graded answers" })).toHaveCount(0);
});

test("@core Monitored assessment requires consent before the server creates an attempt", async ({ page }) => {
  const person = await createPerson("LEARNER");
  const quiz = await assessmentFixture();
  await withDb(db => db.query("UPDATE quizzes SET settings = jsonb_set(settings,'{integrityMode}','true') WHERE id=$1", [quiz]));
  await signIn(page, person);
  const blocked = await page.request.post(`/api/quiz/${quiz}/start`);
  expect(blocked.status()).toBe(403);
  await page.goto(`/quiz/${quiz}`);
  await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Before you start — what this assessment records" });
  await expect(dialog.getByText("No camera. No microphone. No screen recording.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "I understand — start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose the safe greeting" })).toBeVisible();
  const records = await withDb(async db => (await db.query("SELECT count(*)::int AS n FROM consents WHERE user_id=$1 AND kind='integrity' AND version=$2", [person.id, `quiz:${quiz}`])).rows[0].n);
  expect(records).toBe(1);
});

test("@core Practice supports every eligible question kind, including multiple choices, matching and ordering", async ({ page }, info) => {
  const person = await createPerson("LEARNER"), quiz = await assessmentFixture();
  const course = randomUUID(), module = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO courses (id,title,status) VALUES ($1,'QA practice course','PUBLISHED')", [course]);
    await db.query("INSERT INTO modules (id,course_id,title) VALUES ($1,$2,'Practice')", [module, course]);
    await db.query("INSERT INTO lessons (id,module_id,type,title,payload) VALUES ($1,$2,'QUIZ','Practice source',$3)", [randomUUID(), module, JSON.stringify({ quizId: quiz })]);
    const intro = randomUUID();
    await db.query("INSERT INTO lessons (id,module_id,type,title,payload) VALUES ($1,$2,'TEXT','Practice prerequisite',$3)", [intro, module, JSON.stringify({ body: "Completed lesson that enables optional daily practice." })]);
    await db.query("INSERT INTO lesson_progress (id,user_id,lesson_id,status) VALUES ($1,$2,$3,'COMPLETED')", [randomUUID(), person.id, intro]);
    await db.query("INSERT INTO enrollments (id,user_id,course_id,source) VALUES ($1,$2,$3,'manual')", [randomUUID(), person.id, course]);
  });
  await signIn(page, person);
  const served = page.waitForResponse(r => r.url().endsWith("/api/drill") && r.request().method() === "GET");
  await page.goto("/drill");
  const questions = (await (await served).json()).questions as Array<{ type: string; prompt: string }>;
  expect(questions).toHaveLength(6);
  expect(new Set(questions.map(q => q.type))).toEqual(new Set(["mcq_single", "mcq_multi", "truefalse", "fill_blank", "matching", "ordering"]));
  for (const [index, q] of questions.entries()) {
    await expect(page.getByRole("heading", { name: q.prompt, exact: true })).toBeVisible();
    if (q.type === "mcq_single") await page.getByRole("radio", { name: "Hello", exact: true }).check();
    if (q.type === "truefalse") await page.getByRole("radio", { name: "True", exact: true }).check();
    if (q.type === "mcq_multi") {
      await page.getByRole("checkbox", { name: "Wash", exact: true }).check();
      await page.getByRole("checkbox", { name: "Clean", exact: true }).check();
    }
    if (q.type === "fill_blank") await page.getByRole("textbox", { name: "Name the greeting" }).fill("Hello");
    if (q.type === "matching") {
      await page.getByLabel("Match for Hands").selectOption("0");
      await page.getByLabel("Match for Counter").selectOption("1");
    }
    if (q.type === "ordering") {
      await expect(page.getByRole("button", { name: "Move Wet down" })).toBeVisible();
      await page.getByRole("button", { name: "Use this order", exact: true }).click();
      await capture(page, info, "practice-ordering");
    }
    await page.getByRole("button", { name: "Check answer", exact: true }).click();
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByRole("button", { name: index === 5 ? "Finish" : "Next", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "6/6 — nice work" })).toBeVisible();
  const rows = await withDb(async db => (await db.query("SELECT count(*)::int AS n FROM drill_state WHERE user_id=$1 AND streak=1", [person.id])).rows[0].n);
  expect(rows).toBe(6);
});

test("@core Quiz lesson opens preflight and a final pass unlocks the next lesson", async ({ page }) => {
  const person = await createPerson("LEARNER"), quiz = await assessmentFixture();
  const course = randomUUID(), module = randomUUID(), lesson = randomUUID(), next = randomUUID();
  await withDb(async db => {
    const row = (await db.query("SELECT sections FROM quizzes WHERE id=$1", [quiz])).rows[0];
    await db.query("UPDATE quizzes SET lesson_id=$2, sections=$3 WHERE id=$1", [quiz, lesson, JSON.stringify([{ fixed: [row.sections[0].fixed[0]] }])]);
    await db.query("INSERT INTO courses (id,title,status,sequential_lock) VALUES ($1,'QA assessed course','PUBLISHED',true)", [course]);
    await db.query("INSERT INTO modules (id,course_id,title) VALUES ($1,$2,'Service')", [module, course]);
    await db.query("INSERT INTO lessons (id,module_id,type,title,sort,payload) VALUES ($1,$2,'QUIZ','Greeting assessment',0,$3),($4,$2,'TEXT','After the assessment',1,$5)", [lesson, module, JSON.stringify({ quizId: quiz }), next, JSON.stringify({ body: "The next course lesson." })]);
    await db.query("INSERT INTO enrollments (id,user_id,course_id,source) VALUES ($1,$2,$3,'manual')", [randomUUID(), person.id, course]);
  });
  await signIn(page, person);
  await page.goto(`/lesson/${lesson}`);
  await page.getByRole("link", { name: "Open assessment", exact: true }).click();
  await expect(page.getByText("Pass mark 70%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("radio", { name: "Hello", exact: true }).check();
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await expect(page.getByText("Final result: passed", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Return to lesson", exact: true }).click();
  await expect(page.getByText("Lesson complete", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next lesson", exact: true })).toHaveAttribute("href", `/lesson/${next}`);
});
