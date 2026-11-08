import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DEFAULT_SETTINGS } from "../lib/quiz/engine";
import {
  createPerson,
  signIn,
  withDb,
  capture,
  expectNoPageOverflow,
  type Person,
} from "./support";

const LIVE_EXAM_CONFIRM = "Learners will see these answers right after submitting.";
const NOT_AUTHOR = "Only the author, HR Head or Admin can edit this question.";
// Rows preview must never write for the person previewing.
const LEARNER_TABLES = [
  "attempts",
  "lesson_progress",
  "enrollments",
  "points_ledger",
  "badges",
  "streak_state",
  "drill_state",
  "certificates",
  "completion_records",
];

type QuestionSpec =
  | { type: "mcq_single" | "mcq_multi"; prompt: string; options: string[]; correct: number[]; explanation?: string }
  | { type: "truefalse"; prompt: string; answer: "True" | "False"; stimulus?: string }
  | { type: "fill_blank"; prompt: string; accepted: string[] }
  | { type: "matching"; prompt: string; pairs: [string, string][] }
  | { type: "ordering"; prompt: string; steps: string[] }
  | { type: "free_text"; prompt: string; criteria: [string, number][]; model: string };

function sevenQuestions(tag: string) {
  return {
    single: { type: "mcq_single", prompt: `QA single ${tag}: which extinguisher suits electrical fires?`, options: ["Carbon dioxide", "Water"], correct: [0], explanation: "Water conducts electricity." },
    multi: { type: "mcq_multi", prompt: `QA multi ${tag}: which items belong in a first aid kit?`, options: ["Bandages", "Gloves", "Lighter fluid"], correct: [0, 1] },
    truefalse: { type: "truefalse", prompt: `QA true or false ${tag}: fire doors stay closed.`, answer: "True", stimulus: "A fire door is propped open with a wedge." },
    fill: { type: "fill_blank", prompt: `QA fill ${tag}: we gather at the assembly ____.`, accepted: ["point", "assembly point"] },
    matching: { type: "matching", prompt: `QA matching ${tag}: match each sign colour to its meaning.`, pairs: [["Green", "Safe condition"], ["Red", "Prohibition"]] },
    ordering: { type: "ordering", prompt: `QA ordering ${tag}: put the evacuation steps in order.`, steps: ["Raise the alarm", "Leave by the nearest exit", "Report at the assembly point"] },
    written: { type: "free_text", prompt: `QA written ${tag}: explain how you report a hazard.`, criteria: [["Names the supervisor", 2]], model: "Tell the supervisor straight away and log it." },
  } satisfies Record<string, QuestionSpec>;
}

/** Fills QuestionFieldsEditor (the bank page form or the builder's inline dialog). */
async function fillQuestion(scope: Page | Locator, bankId: string, q: QuestionSpec) {
  await scope.getByLabel("Bank", { exact: true }).selectOption(bankId);
  await scope.getByLabel("Question type", { exact: true }).selectOption(q.type);
  await scope.getByLabel("Question", { exact: true }).fill(q.prompt);
  switch (q.type) {
    case "mcq_single":
    case "mcq_multi":
      for (let i = 0; i < q.options.length; i++) {
        if (i >= 2) await scope.getByRole("button", { name: "Add a choice", exact: true }).click();
        await scope.getByLabel(`Answer choice ${i + 1}`, { exact: true }).fill(q.options[i]);
      }
      for (const i of q.correct) await scope.getByLabel(`Answer choice ${i + 1} is correct`, { exact: true }).check();
      if (q.explanation) await scope.getByLabel("Explanation (optional)", { exact: true }).fill(q.explanation);
      break;
    case "truefalse":
      await scope.getByRole("radio", { name: q.answer, exact: true }).check();
      if (q.stimulus) await scope.getByLabel("Scenario (optional)", { exact: true }).fill(q.stimulus);
      break;
    case "fill_blank":
      for (let i = 0; i < q.accepted.length; i++) {
        if (i >= 1) await scope.getByRole("button", { name: "Add an accepted answer", exact: true }).click();
        await scope.getByLabel(`Accepted answer ${i + 1}`, { exact: true }).fill(q.accepted[i]);
      }
      break;
    case "matching":
      for (let i = 0; i < q.pairs.length; i++) {
        if (i >= 2) await scope.getByRole("button", { name: "Add a pair", exact: true }).click();
        await scope.getByLabel(`Pair ${i + 1} left`, { exact: true }).fill(q.pairs[i][0]);
        await scope.getByLabel(`Pair ${i + 1} right`, { exact: true }).fill(q.pairs[i][1]);
      }
      break;
    case "ordering":
      for (let i = 0; i < q.steps.length; i++) {
        if (i >= 2) await scope.getByRole("button", { name: "Add a step", exact: true }).click();
        await scope.getByLabel(`Step ${i + 1}`, { exact: true }).fill(q.steps[i]);
      }
      break;
    case "free_text":
      for (let i = 0; i < q.criteria.length; i++) {
        if (i >= 1) await scope.getByRole("button", { name: "Add a criterion", exact: true }).click();
        await scope.getByLabel(`Criterion ${i + 1} name`, { exact: true }).fill(q.criteria[i][0]);
        await scope.getByLabel(`Criterion ${i + 1} points`, { exact: true }).fill(String(q.criteria[i][1]));
      }
      await scope.getByLabel("Model answer", { exact: true }).fill(q.model);
      break;
  }
}

/** The "Add lesson to <module>" disclosure, with the quiz builder chosen. */
async function openQuizBuilder(page: Page, moduleTitle: string) {
  const add = page.locator("details").filter({ has: page.locator("summary", { hasText: `Add lesson to ${moduleTitle}` }) });
  await add.locator("summary").click();
  await add.getByLabel("Lesson type", { exact: true }).selectOption("QUIZ");
  return add;
}

async function searchBank(builder: Locator, bankId: string) {
  const search = builder.getByRole("region", { name: "Add from the bank" });
  await search.getByLabel("Bank", { exact: true }).selectOption(bankId);
  await search.getByRole("button", { name: "Search", exact: true }).click();
  await expect(search.getByRole("list", { name: "Search results" })).toBeVisible();
  return search;
}

const pickedRows = (builder: Locator) =>
  builder.getByRole("region", { name: "Picked questions" }).locator("ol > li");

async function learnerRows(userId: string) {
  return withDb(async (db) => {
    const counts: Record<string, number> = {};
    for (const table of LEARNER_TABLES)
      counts[table] = (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`, [userId])).rows[0].n;
    return counts;
  });
}

async function quizOf(courseId: string) {
  return withDb(async (db) => (await db.query(
    `SELECT q.id, q.sections, q.settings->>'feedbackMode' AS mode, l.id AS lesson_id
       FROM lessons l JOIN modules m ON m.id=l.module_id JOIN quizzes q ON q.id=l.payload->>'quizId'
      WHERE m.course_id=$1 AND l.type='QUIZ'`,
    [courseId],
  )).rows);
}

/** A learner or outsider is sent away (redirect) or told the page doesn't exist, and sees none of it. */
async function expectNoAccess(page: Page, path: string, secret: string) {
  const response = await page.goto(path);
  const requested = new URL(path, "https://qa.invalid").pathname;
  await expect
    .poll(async () =>
      new URL(page.url()).pathname !== requested ||
      (await page.getByRole("heading", { name: "Page not found", exact: true }).count()) > 0,
      { message: `${path} must redirect or show Page not found` })
    .toBe(true);
  expect(await response!.text()).not.toContain(secret);
  await expect(page.locator("body")).not.toContainText(secret);
}

test.describe.serial("Instructor question bank, quiz builder and preview", () => {
  let tag = "";
  let department = "";
  let instructor: Person;
  let courseId = "";
  let courseTitle = "";
  let bankId = "";
  let bankName = "";
  let qs: ReturnType<typeof sevenQuestions>;
  const moduleTitle = "Fire safety";
  const textTitle = "Before you start";
  const quizTitle = "Fire safety check";

  test("instructor creates a bank with all seven question types and builds a quiz from picked, written and random questions", async ({ page }, info) => {
    test.setTimeout(300_000);
    tag = randomUUID().slice(0, 8);
    department = randomUUID();
    courseTitle = `QA bank course ${tag}`;
    bankName = `QA Bank ${randomUUID()}`;
    qs = sevenQuestions(tag);
    await withDb((db) => db.query("INSERT INTO departments(id,name) VALUES($1,$2)", [department, `QA Question Bank Dept ${tag}`]));
    instructor = await createPerson("INSTRUCTOR", { departmentId: department, name: "QA Bank Instructor" });
    await signIn(page, instructor);

    // The nav item exists for instructors (on phones it sits in the workspace drawer).
    if ((page.viewportSize()?.width ?? 1440) < 768)
      await page.getByRole("button", { name: "Open instructor workspace navigation", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Workspace", exact: true }).filter({ visible: true });
    await Promise.all([page.waitForEvent("load"), nav.getByRole("link", { name: "Question bank", exact: true }).click()]);
    await expect(page).toHaveURL(/\/instructor\/questions$/);
    await expect(page.getByRole("heading", { name: "Question bank", exact: true })).toBeVisible();

    // A new bank.
    await page.getByText("Add a bank", { exact: true }).click();
    await page.getByLabel("Bank name", { exact: true }).fill(bankName);
    await page.getByLabel("Tags (optional)", { exact: true }).fill("fire, qa");
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Create bank", exact: true }).click()]);
    const bank = await withDb(async (db) => (await db.query("SELECT id, tags, course_id FROM question_banks WHERE name=$1", [bankName])).rows);
    expect(bank).toHaveLength(1);
    expect(bank[0].tags).toEqual(["fire", "qa"]);
    expect(bank[0].course_id).toBeNull();
    bankId = bank[0].id;
    await expect(page.getByLabel("Bank", { exact: true }).locator(`option[value="${bankId}"]`)).toHaveText(bankName);

    // One question of each type, each through the new-question form.
    await Promise.all([page.waitForURL(/\/instructor\/questions\/new$/), page.getByRole("link", { name: "New question", exact: true }).first().click()]);
    for (const [index, q] of Object.values(qs).entries()) {
      if (index > 0) await page.goto("/instructor/questions/new");
      await fillQuestion(page, bankId, q);
      if (index === 0) {
        await expectNoPageOverflow(page);
        await capture(page, info, "new-question-form");
      }
      await Promise.all([
        page.waitForURL(/\/instructor\/questions\?question=/),
        page.getByRole("button", { name: "Add question", exact: true }).click(),
      ]);
      const selected = page.getByRole("region", { name: "Selected question" });
      await expect(selected.getByRole("heading", { name: q.prompt, exact: true })).toBeVisible();
      await expect(selected).toContainText("You");
    }
    const stored = await withDb(async (db) => (await db.query(
      "SELECT type, status, created_by, author_id, points, body, rubric FROM questions WHERE bank_id=$1",
      [bankId],
    )).rows);
    expect(stored.map((r) => r.type).sort()).toEqual(["fill_blank", "free_text", "matching", "mcq_multi", "mcq_single", "ordering", "truefalse"]);
    for (const row of stored) expect(row).toMatchObject({ status: "APPROVED", created_by: "human", author_id: instructor.id, points: 1 });
    const byType = new Map(stored.map((r) => [r.type, r]));
    expect(byType.get("truefalse").body).toMatchObject({ prompt: qs.truefalse.prompt, correct: [0], stimulus: qs.truefalse.stimulus });
    expect(byType.get("mcq_multi").body).toMatchObject({ options: qs.multi.options, correct: [0, 1] });
    expect(byType.get("ordering").body.orderItems).toEqual(qs.ordering.steps);
    expect(byType.get("matching").body.pairs).toEqual(qs.matching.pairs.map(([left, right]) => ({ left, right })));
    expect(byType.get("free_text").rubric).toMatchObject({ criteria: [{ name: "Names the supervisor", points: 2 }], modelAnswer: qs.written.model });
    await page.goto(`/instructor/questions?bank=${bankId}`);
    await expect(page.getByRole("region", { name: "Questions" }).getByRole("heading", { name: "7 questions", exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, info, "bank-with-seven-types");

    // A draft course with a text lesson, then a quiz lesson built in the builder.
    await page.goto("/instructor/courses");
    await page.getByLabel("Title", { exact: true }).fill(courseTitle);
    await page.getByRole("button", { name: "Create draft", exact: true }).click();
    await page.waitForURL(/\/instructor\/courses\/[^/?]+$/);
    courseId = new URL(page.url()).pathname.split("/").at(-1)!;
    await page.getByLabel("New module title", { exact: true }).fill(moduleTitle);
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Add module", exact: true }).click()]);
    const addText = page.locator("details").filter({ has: page.locator("summary", { hasText: `Add lesson to ${moduleTitle}` }) });
    await addText.locator("summary").click();
    await addText.getByLabel("Lesson title", { exact: true }).filter({ visible: true }).fill(textTitle);
    await addText.getByLabel("Lesson content", { exact: true }).fill("Know your exits and where the extinguishers are.");
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Add lesson", exact: true }).click()]);
    await expect(page.getByText(textTitle, { exact: true })).toBeVisible();

    const add = await openQuizBuilder(page, moduleTitle);
    await add.getByLabel("Lesson title", { exact: true }).filter({ visible: true }).fill(quizTitle);
    // Two picked from the bank.
    const search = await searchBank(add, bankId);
    await expect(search.getByRole("list", { name: "Search results" }).locator(":scope > li")).toHaveCount(7);
    for (const q of [qs.single, qs.truefalse]) {
      await search.getByRole("button", { name: `Add: ${q.prompt}`, exact: true }).click();
      await expect(search.getByRole("button", { name: `Added: ${q.prompt}`, exact: true })).toBeDisabled();
    }
    // One written inline, saved to the bank and added to the quiz.
    const inline = { type: "fill_blank", prompt: `QA inline ${tag}: the alarm point is red and says ____.`, accepted: ["fire"] } satisfies QuestionSpec;
    await add.getByRole("button", { name: "Write a new question", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Write a new question" });
    await fillQuestion(dialog, bankId, inline);
    await dialog.getByRole("button", { name: "Save and add", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(pickedRows(add)).toHaveCount(3);
    await expect(pickedRows(add).nth(0)).toContainText(qs.single.prompt);
    await expect(pickedRows(add).nth(1)).toContainText(qs.truefalse.prompt);
    await expect(pickedRows(add).nth(2)).toContainText(inline.prompt);
    // A random draw of 2. Asking for more than the bank holds warns first (ruling R9).
    await add.getByRole("button", { name: "Add a random draw", exact: true }).click();
    const draw = add.getByRole("group", { name: "Random draw 1" });
    await draw.getByLabel("Question bank", { exact: true }).selectOption(bankId);
    const overDraw = "Only 8 approved questions in this bank. Lower the number or add questions before submitting for approval.";
    await draw.getByLabel("Questions to draw", { exact: true }).fill("9");
    await expect(draw.getByText(overDraw, { exact: true })).toBeVisible();
    await draw.getByLabel("Questions to draw", { exact: true }).fill("2");
    await expect(draw.getByText(overDraw, { exact: true })).toHaveCount(0);
    await expectNoPageOverflow(page);
    await capture(page, info, "quiz-builder-new");
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Add lesson", exact: true }).click()]);
    await expect(page.getByText(quizTitle, { exact: true })).toBeVisible();

    const inlineRow = await withDb(async (db) => (await db.query(
      "SELECT id, status, created_by, author_id, body FROM questions WHERE bank_id=$1 AND body->>'prompt'=$2",
      [bankId, inline.prompt],
    )).rows);
    expect(inlineRow).toHaveLength(1);
    expect(inlineRow[0]).toMatchObject({ status: "APPROVED", created_by: "human", author_id: instructor.id });
    expect(inlineRow[0].body.acceptedAnswers).toEqual(["fire"]);
    const ids = await withDb(async (db) => Object.fromEntries((await db.query(
      "SELECT body->>'prompt' AS prompt, id FROM questions WHERE bank_id=$1", [bankId],
    )).rows.map((r) => [r.prompt, r.id])));
    let [quiz] = await quizOf(courseId);
    expect(quiz.mode).toBe("PRACTICE");
    expect(quiz.sections).toEqual([
      { fixed: [ids[qs.single.prompt], ids[qs.truefalse.prompt], ids[inline.prompt]] },
      { bankId, pickN: 2 },
    ]);

    // Edit the quiz: it opens with its current content, and one more picked question is added.
    const lesson = page.locator("li").filter({ has: page.getByText(quizTitle, { exact: true }) });
    const edit = lesson.locator("details").filter({ has: page.locator("summary", { hasText: "Edit quiz" }) });
    await edit.locator("summary").click();
    await expect(edit.getByLabel("Quiz title", { exact: true })).toHaveValue(quizTitle);
    await expect(pickedRows(edit)).toHaveCount(3);
    await expect(edit.getByRole("group", { name: "Random draw 1" }).getByLabel("Questions to draw", { exact: true })).toHaveValue("2");
    const editSearch = await searchBank(edit, bankId);
    await expect(editSearch.getByRole("button", { name: `Added: ${qs.single.prompt}`, exact: true })).toBeDisabled();
    await editSearch.getByRole("button", { name: `Add: ${qs.multi.prompt}`, exact: true }).click();
    await expect(pickedRows(edit)).toHaveCount(4);
    await Promise.all([page.waitForEvent("load"), edit.getByRole("button", { name: "Save quiz", exact: true }).click()]);

    // The curriculum's review lists 4 picked questions (with answers) and the random draw.
    const review = lesson.locator("details").filter({ has: page.locator("summary", { hasText: "Review lesson content" }) });
    await review.locator(":scope > summary").click();
    const reviewed = review.getByRole("list", { name: "Picked questions" }).locator(":scope > li");
    await expect(reviewed).toHaveCount(4);
    await expect(reviewed.nth(3)).toContainText(qs.multi.prompt);
    const draws = review.getByRole("list", { name: "Random draws" }).locator(":scope > li");
    await expect(draws).toHaveCount(1);
    await expect(draws).toContainText(`2 random from ${bankName} (8 approved questions)`);
    [quiz] = await quizOf(courseId);
    expect(quiz.sections).toEqual([
      { fixed: [ids[qs.single.prompt], ids[qs.truefalse.prompt], ids[inline.prompt], ids[qs.multi.prompt]] },
      { bankId, pickN: 2 },
    ]);
    await expectNoPageOverflow(page);
    await capture(page, info, "curriculum-four-picked");
  });

  test("instructor previews every lesson and takes the quiz without anything being saved", async ({ page }, info) => {
    test.setTimeout(180_000);
    // Prerequisite: a learner rule the preview should describe instead of enforcing.
    await withDb((db) => db.query("UPDATE courses SET sequential_lock=true WHERE id=$1", [courseId]));
    const [quiz] = await quizOf(courseId);
    const before = await learnerRows(instructor.id);
    const quizAttempts = () => withDb(async (db) => (await db.query("SELECT count(*)::int AS n FROM attempts WHERE quiz_id=$1", [quiz.id])).rows[0].n);
    expect(await quizAttempts()).toBe(0);

    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${courseId}`);
    await Promise.all([page.waitForURL(`**/preview/course/${courseId}`), page.getByRole("link", { name: "Preview as learner", exact: true }).click()]);
    const banner = page.getByRole("region", { name: "Preview", exact: true });
    await expect(banner).toContainText("Preview — nothing is saved");
    await expect(banner.getByRole("link", { name: "Back to editor", exact: true })).toHaveAttribute("href", `/instructor/courses/${courseId}`);
    await expect(page.getByRole("heading", { name: courseTitle, exact: true })).toBeVisible();
    await expect(page.getByText("Learners complete lessons in order.", { exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, info, "preview-overview");

    // Every lesson opens, the later one with a note instead of a lock.
    const lessons = await withDb(async (db) => (await db.query(
      "SELECT l.id, l.title, l.type FROM lessons l JOIN modules m ON m.id=l.module_id WHERE m.course_id=$1 ORDER BY m.sort, l.sort",
      [courseId],
    )).rows);
    expect(lessons.map((l) => l.title)).toEqual([textTitle, quizTitle]);
    await page.getByRole("link", { name: "Start course", exact: true }).click();
    await expect(page).toHaveURL(`/preview/course/${courseId}/lesson/${lessons[0].id}`);
    await expect(page.getByRole("heading", { level: 1, name: textTitle, exact: true })).toBeVisible();
    await expect(page.getByText("Know your exits and where the extinguishers are.", { exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Lesson navigation" }).getByRole("link", { name: "Next lesson", exact: true }).click();
    await expect(page).toHaveURL(`/preview/course/${courseId}/lesson/${lessons[1].id}`);
    for (const lesson of lessons) {
      await page.goto(`/preview/course/${courseId}/lesson/${lesson.id}`);
      await expect(page.getByRole("region", { name: "Preview", exact: true })).toContainText("Preview — nothing is saved");
      await expect(page.getByRole("heading", { level: 1, name: lesson.title, exact: true })).toBeVisible();
      await expect(page.getByText("Learners unlock this lesson after completing the previous one.", { exact: true })).toHaveCount(lesson === lessons[0] ? 0 : 1);
      await expect(page.getByRole("button", { name: "Mark complete", exact: true })).toHaveCount(0);
    }

    // Take the quiz for real: the 4 picked questions answered correctly, the 2 random ones left blank.
    await Promise.all([page.waitForURL(`**/preview/course/${courseId}/quiz/${lessons[1].id}`), page.getByRole("link", { name: "Open assessment", exact: true }).click()]);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const cards = page.locator('[id^="question-"]');
    await expect(cards).toHaveCount(6);
    const card = (prompt: string) => cards.filter({ has: page.getByRole("heading", { name: prompt, exact: true }) });
    await card(qs.single.prompt).getByRole("radio", { name: "Carbon dioxide", exact: true }).check();
    await card(qs.truefalse.prompt).getByRole("radio", { name: "True", exact: true }).check();
    await card(`QA inline ${tag}: the alarm point is red and says ____.`).getByRole("textbox").fill("fire");
    for (const option of ["Bandages", "Gloves"]) await card(qs.multi.prompt).getByRole("checkbox", { name: option, exact: true }).check();
    await expectNoPageOverflow(page);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    const score = page.getByText(/^Score \d+ of \d+ \([\d.]+%\)$/);
    await expect(score).toBeVisible();
    const [, earned, possible] = (await score.textContent())!.match(/^Score (\d+) of (\d+)/)!;
    expect(Number(earned)).toBe(4);
    // Written answers are left out of the score, so a drawn written question makes it 5 rather than 6.
    expect([5, 6]).toContain(Number(possible));
    await expect(page.getByText("Pass mark 70%", { exact: true })).toBeVisible();
    // Every served question comes back with its answers ("1. <prompt>" … "6. <prompt>").
    await expect(page.locator("p").filter({ hasText: /^\d+\. QA / })).toHaveCount(6);
    await expect(page.getByText("Correct answer", { exact: true }).first()).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, info, "preview-quiz-result");

    expect(await learnerRows(instructor.id)).toEqual(before);
    expect(await quizAttempts()).toBe(0);
  });

  test("learners cannot reach preview or the bank; the course's Department Head can preview and sees the answer key", async ({ browser, page }, info) => {
    test.setTimeout(180_000);
    const learner = await createPerson("LEARNER", { departmentId: department });
    const head = await createPerson("DEPARTMENT_HEAD", { departmentId: department, name: "QA Bank Department Head" });
    const outsider = await createPerson("DEPARTMENT_HEAD");
    const [quiz] = await quizOf(courseId);

    // The instructor submits for approval, so the head reviews it on the approval page.
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${courseId}`);
    await page.getByRole("region", { name: "Approval workflow" }).getByRole("button", { name: "Submit for approval", exact: true }).click();
    await expect(page.getByText("Awaiting Department Head approval", { exact: true })).toBeVisible();

    const contexts = await Promise.all([learner, head, outsider].map(() =>
      browser.newContext({ baseURL: process.env.QA_BASE ?? "https://localhost:3443", ignoreHTTPSErrors: info.project.use.browserName !== "chromium" })));
    try {
      const [learnerPage, headPage, outsiderPage] = await Promise.all(contexts.map((c) => c.newPage()));
      await Promise.all([signIn(learnerPage, learner), signIn(headPage, head), signIn(outsiderPage, outsider)]);

      for (const path of [`/preview/course/${courseId}`, `/preview/course/${courseId}/lesson/${quiz.lesson_id}`, `/preview/course/${courseId}/quiz/${quiz.lesson_id}`])
        await expectNoAccess(learnerPage, path, courseTitle);
      await expectNoAccess(learnerPage, "/instructor/questions", qs.single.prompt);
      await expectNoAccess(learnerPage, `/instructor/questions?bank=${bankId}`, bankName);
      await expectNoAccess(outsiderPage, `/preview/course/${courseId}`, courseTitle);

      await headPage.goto(`/department/approvals/${courseId}`);
      await expect(headPage.getByRole("heading", { name: courseTitle, exact: true })).toBeVisible();
      await expect(headPage.getByText("Edit quiz", { exact: true })).toHaveCount(0);
      const lesson = headPage.locator("li").filter({ has: headPage.getByText(quizTitle, { exact: true }) });
      const review = lesson.locator("details").filter({ has: headPage.locator("summary", { hasText: "Review lesson content" }) });
      await review.locator(":scope > summary").click();
      const picked = review.getByRole("list", { name: "Picked questions" }).locator(":scope > li");
      await expect(picked).toHaveCount(4);
      const single = picked.filter({ hasText: qs.single.prompt });
      await expect(single.getByRole("list", { name: "Answer choices" }).getByRole("listitem").filter({ hasText: "Carbon dioxide" })).toContainText("Correct answer");
      await expect(single.getByRole("list", { name: "Answer choices" }).getByRole("listitem").filter({ hasText: "Water" })).not.toContainText("Correct answer");
      await expect(single).toContainText(qs.single.explanation);
      await expect(picked.filter({ hasText: qs.truefalse.prompt })).toContainText("Correct answerTrue");
      await expect(picked.filter({ hasText: "QA inline" }).getByRole("list", { name: "Accepted answers" })).toHaveText("fire");
      // Under the draw, the approver can open every approved question the draw can serve, with its answers.
      const draw = review.getByRole("list", { name: "Random draws" }).locator(":scope > li");
      await expect(draw).toHaveCount(1);
      await expect(draw).toContainText(`2 random from ${bankName} (8 approved questions)`);
      await draw.getByText("Show the approved questions in this bank", { exact: true }).click();
      const drawable = draw.getByRole("list", { name: `Approved questions in ${bankName}`, exact: true }).locator(":scope > li");
      await expect(drawable).toHaveCount(8);
      await expect(drawable.filter({ hasText: qs.matching.prompt }).getByRole("list", { name: "Correct pairs" })).toContainText("Green → Safe condition");
      await expect(drawable.filter({ hasText: qs.single.prompt }).getByRole("list", { name: "Answer choices" }).getByRole("listitem").filter({ hasText: "Carbon dioxide" })).toContainText("Correct answer");
      await expectNoPageOverflow(headPage);
      await capture(headPage, info, "department-head-answer-key");

      await Promise.all([headPage.waitForURL(`**/preview/course/${courseId}`), headPage.getByRole("link", { name: "Preview as learner", exact: true }).click()]);
      const banner = headPage.getByRole("region", { name: "Preview", exact: true });
      await expect(banner).toContainText("Preview — nothing is saved");
      await expect(banner.getByRole("link", { name: "Back to editor", exact: true })).toHaveAttribute("href", `/department/courses/${courseId}`);
      await headPage.goto(`/preview/course/${courseId}/lesson/${quiz.lesson_id}`);
      await expect(headPage.getByRole("heading", { level: 1, name: quizTitle, exact: true })).toBeVisible();
      await expectNoPageOverflow(headPage);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
});

test("instructors cannot edit another author's question, and a bank feeding live training refuses new questions", async ({ page }, info) => {
  test.setTimeout(180_000);
  const tag = randomUUID().slice(0, 8);
  const department = randomUUID();
  await withDb((db) => db.query("INSERT INTO departments(id,name) VALUES($1,$2)", [department, `QA Live Bank Dept ${tag}`]));
  const authorA = await createPerson("INSTRUCTOR", { departmentId: department, name: "QA Instructor A" });
  const authorB = await createPerson("INSTRUCTOR", { departmentId: department, name: "QA Instructor B" });
  const bank = randomUUID(), questionA = randomUUID();
  const bankName = `QA live bank ${tag}`;
  const promptA = `QA live ${tag}: where is the nearest fire alarm point?`;
  const live = { course: randomUUID(), module: randomUUID(), lesson: randomUUID(), quiz: randomUUID(), title: `QA live exam course ${tag}` };
  const draft = { course: randomUUID(), module: randomUUID(), title: `QA practice course ${tag}`, moduleTitle: "Practice module" };
  // Prerequisites: A's question in bank X, a course whose exam-mode quiz draws randomly from X
  // (a draft for now), and B's own draft course.
  await withDb(async (db) => {
    await db.query("INSERT INTO question_banks(id,name) VALUES($1,$2)", [bank, bankName]);
    await db.query(
      "INSERT INTO questions(id,bank_id,type,status,created_by,author_id,body) VALUES($1,$2,'mcq_single','APPROVED','human',$3,$4)",
      [questionA, bank, authorA.id, JSON.stringify({ prompt: promptA, options: ["By the main exit", "In the car park"], correct: [0] })],
    );
    await db.query("INSERT INTO courses(id,title,status,approval_state,department_id) VALUES($1,$2,'DRAFT','DRAFT',$3)", [live.course, live.title, department]);
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,'Exam module')", [live.module, live.course]);
    await db.query(
      "INSERT INTO quizzes(id,lesson_id,title,settings,sections) VALUES($1,$2,'QA live exam',$3,$4)",
      [live.quiz, live.lesson, JSON.stringify({ ...DEFAULT_SETTINGS, feedbackMode: "EXAM" }), JSON.stringify([{ bankId: bank, pickN: 1 }])],
    );
    await db.query("INSERT INTO lessons(id,module_id,type,title,payload) VALUES($1,$2,'QUIZ','QA live exam',$3)", [live.lesson, live.module, JSON.stringify({ quizId: live.quiz })]);
    await db.query(
      "INSERT INTO courses(id,title,status,approval_state,instructor_id,created_by,department_id) VALUES($1,$2,'DRAFT','DRAFT',$3,$3,$4)",
      [draft.course, draft.title, authorB.id, department],
    );
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,$3)", [draft.module, draft.course, draft.moduleTitle]);
  });
  const liveCourse = () => withDb(async (db) => (await db.query("SELECT content_revision, approval_state FROM courses WHERE id=$1", [live.course])).rows[0]);
  const bankCount = () => withDb(async (db) => (await db.query("SELECT count(*)::int AS n FROM questions WHERE bank_id=$1", [bank])).rows[0].n);
  await signIn(page, authorB);

  // B cannot edit A's question, and is offered a copy instead.
  await page.goto(`/instructor/questions/${questionA}/edit`);
  await expect(page.locator("main").getByText(NOT_AUTHOR, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Copy and edit", exact: true })).toHaveAttribute("href", `/instructor/questions/new?from=${questionA}`);
  await expect(page.getByLabel("Question", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save question", exact: true })).toHaveCount(0);
  await expectNoPageOverflow(page);
  await capture(page, info, "edit-blocked-not-author");

  // While the course drawing from X is a draft, adding to X works and costs that draft a revision.
  const revisionBefore = (await liveCourse()).content_revision;
  const first = { type: "truefalse", prompt: `QA added ${tag}: alarms are tested weekly.`, answer: "True" } satisfies QuestionSpec;
  await page.goto("/instructor/questions/new");
  await fillQuestion(page, bank, first);
  await Promise.all([page.waitForURL(/\/instructor\/questions\?question=/), page.getByRole("button", { name: "Add question", exact: true }).click()]);
  expect(await bankCount()).toBe(2);
  expect(await liveCourse()).toEqual({ content_revision: revisionBefore + 1, approval_state: "DRAFT" });

  // Publish that course (prerequisite, as an approved and published course).
  await withDb((db) => db.query(
    "UPDATE courses SET status='PUBLISHED', approval_state='APPROVED', approved_revision=content_revision, submitted_revision=content_revision WHERE id=$1",
    [live.course],
  ));
  const second = { type: "truefalse", prompt: `QA refused ${tag}: exits may be locked during shifts.`, answer: "False" } satisfies QuestionSpec;
  await page.goto("/instructor/questions/new");
  await fillQuestion(page, bank, second);
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    `This bank feeds live training (${live.title}). Choose another bank or create a new one.`,
  );
  await expect(page.getByLabel("Question", { exact: true })).toHaveValue(second.prompt);
  expect(await bankCount()).toBe(2);
  await expectNoPageOverflow(page);
  await capture(page, info, "live-bank-refused");

  // A practice quiz picking a live-exam question asks first: Cancel keeps the form, OK saves.
  await page.goto(`/instructor/courses/${draft.course}`);
  const add = await openQuizBuilder(page, draft.moduleTitle);
  await add.getByLabel("Lesson title", { exact: true }).filter({ visible: true }).fill("QA practice check");
  const search = await searchBank(add, bank);
  await expect(search.getByRole("list", { name: "Search results" }).locator(":scope > li").filter({ hasText: promptA })).toContainText("Used in a live exam");
  await search.getByRole("button", { name: `Add: ${promptA}`, exact: true }).click();
  await expect(pickedRows(add)).toHaveCount(1);
  await expect(pickedRows(add).first()).toContainText("Used in a live exam");
  await expect(add.getByLabel("Exam mode (feedback after submission)", { exact: true })).not.toBeChecked();
  const lessonsInDraft = () => withDb(async (db) => (await db.query("SELECT count(*)::int AS n FROM lessons WHERE module_id=$1", [draft.module])).rows[0].n);
  const dialogs: { type: string; message: string }[] = [];
  page.once("dialog", (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    void d.dismiss();
  });
  await page.getByRole("button", { name: "Add lesson", exact: true }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toEqual({ type: "confirm", message: LIVE_EXAM_CONFIRM });
  await expect(add.getByLabel("Lesson title", { exact: true }).filter({ visible: true })).toHaveValue("QA practice check");
  await expect(pickedRows(add)).toHaveCount(1);
  await expect(add.getByText("Saving…", { exact: true })).toHaveCount(0);
  expect(await lessonsInDraft()).toBe(0);
  await capture(page, info, "live-exam-confirm-cancelled");
  page.once("dialog", (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    void d.accept();
  });
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Add lesson", exact: true }).click()]);
  expect(dialogs).toEqual([
    { type: "confirm", message: LIVE_EXAM_CONFIRM },
    { type: "confirm", message: LIVE_EXAM_CONFIRM },
  ]);
  await expect(page.getByText("QA practice check", { exact: true })).toBeVisible();
  // Exactly one lesson: the cancelled save sent nothing.
  expect(await lessonsInDraft()).toBe(1);
  const [quiz] = await quizOf(draft.course);
  expect(quiz.mode).toBe("PRACTICE");
  expect(quiz.sections).toEqual([{ fixed: [questionA] }]);
});

test("bank, builder and preview fit a 360px phone with a 300-character unbroken prompt and option", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium-mobile", "Phone-width overflow check runs on chromium-mobile.");
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 800 });
  const tag = randomUUID().slice(0, 8);
  const longPrompt = `QALONG${tag}`.padEnd(300, "W");
  const longOption = `QAOPTION${tag}`.padEnd(300, "M");
  expect([longPrompt.length, longOption.length]).toEqual([300, 300]);
  const instructor = await createPerson("INSTRUCTOR", { name: "QA Phone Instructor" });
  const bank = randomUUID(), question = randomUUID();
  const course = { id: randomUUID(), module: randomUUID(), lesson: randomUUID(), quiz: randomUUID(), title: `QA phone course ${tag}` };
  const empty = { id: randomUUID(), title: `QA empty course ${tag}` };
  const moduleTitle = "Phone module";
  await withDb(async (db) => {
    await db.query("INSERT INTO question_banks(id,name) VALUES($1,$2)", [bank, `QA phone bank ${tag}`]);
    await db.query(
      "INSERT INTO questions(id,bank_id,type,status,created_by,author_id,body) VALUES($1,$2,'mcq_single','APPROVED','human',$3,$4)",
      [question, bank, instructor.id, JSON.stringify({ prompt: longPrompt, options: [longOption, "Short option"], correct: [0], explanation: "Long content must wrap." })],
    );
    for (const c of [course, empty])
      await db.query("INSERT INTO courses(id,title,status,approval_state,instructor_id,created_by) VALUES($1,$2,'DRAFT','DRAFT',$3,$3)", [c.id, c.title, instructor.id]);
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,$3)", [course.module, course.id, moduleTitle]);
    await db.query(
      "INSERT INTO quizzes(id,lesson_id,title,settings,sections) VALUES($1,$2,'QA phone quiz',$3,$4)",
      [course.quiz, course.lesson, JSON.stringify(DEFAULT_SETTINGS), JSON.stringify([{ fixed: [question] }])],
    );
    await db.query("INSERT INTO lessons(id,module_id,type,title,payload) VALUES($1,$2,'QUIZ','QA phone quiz',$3)", [course.lesson, course.module, JSON.stringify({ quizId: course.quiz })]);
  });
  await signIn(page, instructor);

  // Bank page: the list, then the opened question with its long option.
  await page.goto(`/instructor/questions?bank=${bank}`);
  await expect(page.getByRole("link", { name: longPrompt, exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await capture(page, info, "phone-bank-list");
  await page.goto(`/instructor/questions?bank=${bank}&question=${question}`);
  await expect(page.getByRole("region", { name: "Selected question" }).getByText(longOption, { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await capture(page, info, "phone-bank-question");

  // Builder: editing the quiz, the answer key, and bank search results in a new quiz.
  await page.goto(`/instructor/courses/${course.id}`);
  const lesson = page.locator("li").filter({ has: page.getByText("QA phone quiz", { exact: true }) });
  const edit = lesson.locator("details").filter({ has: page.locator("summary", { hasText: "Edit quiz" }) });
  await edit.locator("summary").click();
  await expect(pickedRows(edit).first()).toContainText(longPrompt);
  await expectNoPageOverflow(page);
  await capture(page, info, "phone-builder-edit");
  const review = lesson.locator("details").filter({ has: page.locator("summary", { hasText: "Review lesson content" }) });
  await review.locator(":scope > summary").click();
  await expect(review.getByText(longOption, { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  const add = await openQuizBuilder(page, moduleTitle);
  const search = await searchBank(add, bank);
  await expect(search.getByRole("list", { name: "Search results" })).toContainText(longPrompt);
  await expectNoPageOverflow(page);
  await capture(page, info, "phone-builder-search");

  // Preview: the lesson page, the running quiz and its result.
  await page.goto(`/preview/course/${course.id}/lesson/${course.lesson}`);
  await expect(page.getByRole("region", { name: "Preview", exact: true })).toContainText("Preview — nothing is saved");
  await expectNoPageOverflow(page);
  await capture(page, info, "phone-preview-lesson");
  await page.getByRole("link", { name: "Open assessment", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: longPrompt, exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await capture(page, info, "phone-preview-quiz");
  await page.getByRole("radio", { name: longOption, exact: true }).check();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Score 1 of 1 (100%)", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await capture(page, info, "phone-preview-result");

  // A course with no lessons previews as an empty outline.
  await page.goto(`/preview/course/${empty.id}`);
  await expect(page.getByText("This course has no lessons yet.", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
});
