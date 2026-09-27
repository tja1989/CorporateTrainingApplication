import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb } from "./support";
import { smallQuiz, textCourse } from "./qualification-fixtures";

test("@core A fresh same-page no-backtrack sitting resets navigation and answers", async ({ page }) => {
  const learner = await createPerson("LEARNER"), fixture = await smallQuiz({ oneAtATime: true, noBacktrack: true, attemptsLimit: 3 });
  await signIn(page, learner); await page.goto(`/quiz/${fixture.quiz}`);
  await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("radio", { name: "Skip washing", exact: true }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("textbox", { name: "Type the safety word" }).fill("unsafe");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await expect(page.getByText("Final result: not passed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review attempts and retry", exact: true }).click();
  await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Question 1, unanswered", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("radio", { name: "Wash hands", exact: true })).not.toBeChecked();
  await page.getByRole("radio", { name: "Wash hands", exact: true }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Type the safety word" })).toBeEmpty();
  await page.getByRole("textbox", { name: "Type the safety word" }).fill("safe");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await expect(page.getByText("Final result: passed", { exact: true })).toBeVisible();
  const attempts = await withDb(async db => (await db.query("SELECT id,passed,answers,navigation_index FROM attempts WHERE user_id=$1 AND quiz_id=$2 ORDER BY started_at", [learner.id, fixture.quiz])).rows);
  expect(attempts).toHaveLength(2); expect(attempts.map(a => a.passed)).toEqual([false, true]);
  expect(attempts[0].answers[fixture.questions[1]].text).toBe("unsafe"); expect(attempts[1].navigation_index).toBe(1);
});

test("@core No-backtrack saves skipped boundaries across refresh and retains a failed forward answer until retry", async ({ page }) => {
  const learner = await createPerson("LEARNER"), fixture = await smallQuiz({ oneAtATime: true, noBacktrack: true });
  await signIn(page, learner); await page.goto(`/quiz/${fixture.quiz}`);
  await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Type the safety word" })).toBeVisible();
  const attempt = await withDb(async db => (await db.query("SELECT id,answers,navigation_index FROM attempts WHERE user_id=$1 AND quiz_id=$2", [learner.id, fixture.quiz])).rows[0]);
  expect(attempt.answers).toEqual({}); expect(attempt.navigation_index).toBe(1);
  await page.reload(); await page.getByRole("button", { name: "Resume attempt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Question 1, unanswered", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Type the safety word" })).toBeVisible();
  for (const data of [{ navigationIndex: 0 }, { answers: { [fixture.questions[0]]: { kind: "choice", selected: [0] } } }]) {
    const response = await page.request.patch(`/api/attempt/${attempt.id}`, { data }); expect(response.status()).toBe(409); expect((await response.json()).submitted).toBe(false);
  }
  const second = await smallQuiz({ oneAtATime: true, noBacktrack: true });
  await page.goto(`/quiz/${second.quiz}`); await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("radio", { name: "Wash hands", exact: true }).check();
  await page.route("**/api/attempt/*", route => route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue());
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your next question could not be saved" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Wash hands", exact: true })).toBeChecked();
  const failed = await withDb(async db => (await db.query("SELECT id,navigation_index,answers FROM attempts WHERE user_id=$1 AND quiz_id=$2", [learner.id, second.quiz])).rows[0]);
  expect(failed.navigation_index).toBe(0); expect(failed.answers).toEqual({});
  await page.unroute("**/api/attempt/*"); await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.reload(); await page.getByRole("button", { name: "Resume attempt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Question 1, answered", exact: true })).toBeDisabled();
  expect(await withDb(async db => (await db.query("SELECT answers FROM attempts WHERE id=$1", [failed.id])).rows[0].answers[second.questions[0]])).toEqual({ kind: "choice", selected: [0] });
  const concurrent = await smallQuiz({ oneAtATime: true, noBacktrack: true });
  await page.goto(`/quiz/${concurrent.quiz}`); await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Wash hands", exact: true })).toBeVisible();
  const currentId = await withDb(async db => (await db.query("SELECT id FROM attempts WHERE user_id=$1 AND quiz_id=$2", [learner.id, concurrent.quiz])).rows[0].id);
  const conflicting = await Promise.all([0, 1].map(selected => page.request.patch(`/api/attempt/${currentId}`, { data: { navigationIndex: 1, answers: { [concurrent.questions[0]]: { kind: "choice", selected: [selected] } } } })));
  expect(conflicting.map(response => response.status()).sort()).toEqual([200, 409]);
  // The compatible legacy save body can still save the unlocked current question.
  expect((await page.request.patch(`/api/attempt/${currentId}`, { data: { answers: { [concurrent.questions[1]]: { kind: "text", text: "safe" } } } })).status()).toBe(200);
  await page.reload(); await page.getByRole("button", { name: "Resume attempt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Question 1, answered", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Type the safety word" })).toHaveValue("safe");

});

for (const passed of [true, false]) test(`@core Human-cleared ${passed ? "pass" : "fail"} remains final in the learner result`, async ({ page, browser, baseURL }) => {
  const learner = await createPerson("LEARNER"), admin = await createPerson("ADMIN"), fixture = await smallQuiz();
  await signIn(page, learner); await page.goto(`/quiz/${fixture.quiz}`); await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("radio", { name: passed ? "Wash hands" : "Skip washing", exact: true }).check();
  await page.getByRole("textbox", { name: "Type the safety word" }).fill(passed ? "safe" : "unsafe");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await expect(page.getByText(`Final result: ${passed ? "passed" : "not passed"}`, { exact: true })).toBeVisible();
  const attempt = await withDb(async db => (await db.query("SELECT id FROM attempts WHERE user_id=$1 AND quiz_id=$2", [learner.id, fixture.quiz])).rows[0].id);
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    const adminPage = await context.newPage(); await signIn(adminPage, admin); await adminPage.goto(`/admin/integrity/${attempt}`);
    await adminPage.getByRole("button", { name: "Clear — result stands", exact: true }).click();
    await expect(adminPage.getByText("Cleared — result stands", { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByText("Pending confirmation", { exact: true })).toHaveCount(0);
    await expect(page.getByText(passed ? "Passed" : "Not passed", { exact: true })).toBeVisible();
    expect(await withDb(async db => (await db.query("SELECT state,grading_state,passed FROM attempts WHERE id=$1", [attempt])).rows[0])).toEqual({ state: "CLEARED", grading_state: "FINAL", passed });
  } finally { await context.close(); }
});

test("@core Voiding a certified pass preserves issued history and grants a fresh assessment sitting", async ({ page, browser, baseURL }) => {
  const learner = await createPerson("LEARNER"), admin = await createPerson("ADMIN"), course = await textCourse(learner.id, { certificate: true }), fixture = await smallQuiz({ attemptsLimit: 1 });
  await withDb(async db => { await db.query("UPDATE lessons SET type='QUIZ',payload=$2 WHERE id=$1", [course.lesson, JSON.stringify({ quizId: fixture.quiz })]); await db.query("UPDATE quizzes SET lesson_id=$2 WHERE id=$1", [fixture.quiz, course.lesson]); });
  await signIn(page, learner); await page.goto(`/quiz/${fixture.quiz}`); await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("radio", { name: "Wash hands", exact: true }).check(); await page.getByRole("textbox", { name: "Type the safety word" }).fill("safe"); await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await expect(page.getByText("Final result: passed", { exact: true })).toBeVisible();
  const history = () => withDb(async db => ({ completion: (await db.query("SELECT * FROM completion_records WHERE user_id=$1 AND course_id=$2", [learner.id, course.course])).rows, certificate: (await db.query("SELECT * FROM certificates WHERE user_id=$1 AND course_id=$2", [learner.id, course.course])).rows }));
  const before = await history(); expect(before.completion).toHaveLength(1); expect(before.certificate).toHaveLength(1);
  const attempt = await withDb(async db => (await db.query("SELECT id FROM attempts WHERE user_id=$1 AND quiz_id=$2", [learner.id, fixture.quiz])).rows[0].id);
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  try { const adminPage = await context.newPage(); await signIn(adminPage, admin); await adminPage.goto(`/admin/integrity/${attempt}`); await adminPage.getByLabel("Void reason (required)").fill("QA human decision; issued completion remains valid under the existing policy"); await adminPage.getByRole("button", { name: "Void — grant fresh attempt", exact: true }).click(); await expect(adminPage.getByText(/Voided: QA human decision/)).toBeVisible(); } finally { await context.close(); }
  expect(await history()).toEqual(before);
  await page.reload(); await expect(page.getByText("1 attempt(s) left", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Wash hands", exact: true })).not.toBeChecked();
  const rows = await withDb(async db => (await db.query("SELECT id,state,passed FROM attempts WHERE user_id=$1 AND quiz_id=$2 ORDER BY started_at", [learner.id, fixture.quiz])).rows);
  expect(rows).toHaveLength(2); expect(rows[0]).toEqual({ id: attempt, state: "VOIDED", passed: true }); expect(rows[1].state).toBe("IN_PROGRESS");
});
