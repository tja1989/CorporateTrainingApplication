import { test, expect } from "@playwright/test";
import { smallQuiz } from "./qualification-fixtures";
import { createPerson, signIn, withDb, capture, reviewAssessmentAttempts } from "./support";

test("@core Assessment navigation and refresh retain server answers and accommodated deadline", async ({ page }, info) => {
  const learner = await createPerson("LEARNER"), f = await smallQuiz({ oneAtATime: true, timeLimitSec: 600 });
  await withDb(db => db.query("UPDATE users SET time_multiplier=1.5 WHERE id=$1", [learner.id]));
  await signIn(page, learner); await page.goto(`/quiz/${f.quiz}`);
  await expect(page.getByText("15 min (×1.5 accommodation)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("radio", { name: "Wash hands", exact: true }).check();
  await page.getByRole("button", { name: "Question 2, unanswered", exact: true }).click();
  await page.getByRole("textbox", { name: "Type the safety word" }).fill("safe");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Wash hands", exact: true })).toBeChecked();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  const before = await withDb(async db => (await db.query("SELECT id,deadline_at,started_at,answers FROM attempts WHERE user_id=$1 AND quiz_id=$2", [learner.id, f.quiz])).rows[0]);
  expect((before.deadline_at.getTime() - before.started_at.getTime()) / 1000).toBeGreaterThan(899);
  expect((before.deadline_at.getTime() - before.started_at.getTime()) / 1000).toBeLessThan(902);
  await page.reload(); await page.getByRole("button", { name: "Resume attempt", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Wash hands", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Question 2, answered", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Type the safety word" })).toHaveValue("safe");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await expect(page.getByText("Final result: passed", { exact: true })).toBeVisible();
  const rows = await withDb(async db => (await db.query("SELECT id,deadline_at,answers,passed FROM attempts WHERE user_id=$1 AND quiz_id=$2", [learner.id, f.quiz])).rows);
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ id: before.id, deadline_at: before.deadline_at, answers: before.answers, passed: true });
  await capture(page, info, "assessment-resume-final");
});

test("@core Sixty-second disconnect keeps answers in the open tab and reconnect saves before submitting once", async ({ page, context }, info) => {
  test.setTimeout(110_000);
  const learner = await createPerson("LEARNER"), f = await smallQuiz();
  await signIn(page, learner); await page.goto(`/quiz/${f.quiz}`);
  await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Wash hands", exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("radio", { name: "Wash hands", exact: true }).check();
  await page.getByRole("textbox", { name: "Type the safety word" }).fill("safe");
  const disconnectedAt = Date.now();
  await expect(page.getByText("Not saved — keep this tab open", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("alert").filter({ hasText: "Answers are not saved yet" })).toBeVisible();
  await page.waitForTimeout(Math.max(0, 60_100 - (Date.now() - disconnectedAt)));
  await expect(page.getByRole("textbox", { name: "Type the safety word" })).toHaveValue("safe");
  await capture(page, info, "assessment-disconnected-sixty-seconds");
  await context.setOffline(false);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  const submitted = page.waitForResponse(r => /\/api\/attempt\//.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).dblclick();
  expect((await submitted).ok()).toBe(true);
  await expect(page.getByText("Final result: passed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Passed", { exact: true })).toBeVisible();
  const stored = await withDb(async db => (await db.query("SELECT answers,passed FROM attempts WHERE user_id=$1 AND quiz_id=$2", [learner.id, f.quiz])).rows);
  expect(stored).toHaveLength(1); expect(stored[0].passed).toBe(true);
  expect(stored[0].answers[f.questions[1]]).toEqual({ kind: "text", text: "safe" });
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='quiz_graded'", [learner.id])).rows[0].n)).toBe(1);
});

test("@core Assessment windows, cooldown, attempt limits and exam answer sealing are enforced", async ({ page }) => {
  const learner = await createPerson("LEARNER");
  const future = await smallQuiz({ availableFrom: new Date(Date.now()+3600_000).toISOString() });
  const closed = await smallQuiz({ availableUntil: new Date(Date.now()-3600_000).toISOString() });
  await signIn(page, learner);
  for (const [f, label] of [[future, "Not open yet"], [closed, "Window closed"]] as const) {
    await page.goto(`/quiz/${f.quiz}`); await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start assessment", exact: true })).toHaveCount(0);
  }
  const exam = await smallQuiz({ feedbackMode: "EXAM", attemptsLimit: 2, cooldownMinutes: 60 });
  await page.goto(`/quiz/${exam.quiz}`); await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("radio", { name: "Wash hands", exact: true }).check();
  await page.getByRole("textbox", { name: "Type the safety word" }).fill("safe");
  const response = page.waitForResponse(r => /\/api\/attempt\//.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  expect(await (await response).json()).toMatchObject({ reveal: false, review: [] });
  await expect(page.getByText("Correct answers are revealed after the assessment window closes.")).toBeVisible();
  await expect(page.getByText("Clean hands protect customers.", { exact: true })).toHaveCount(0);
  await reviewAssessmentAttempts(page);
  await expect(page.getByText("1 attempt(s) left", { exact: true })).toBeVisible();
  await expect(page.getByText(/Next attempt available at/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start assessment", exact: true })).toHaveCount(0);
  // Advancing the fixture's prior submission and release condition prepares the next allowed attempt.
  await withDb(async db => {
    await db.query("UPDATE attempts SET submitted_at=now()-interval '61 minutes' WHERE user_id=$1 AND quiz_id=$2", [learner.id, exam.quiz]);
    await db.query("UPDATE quizzes SET settings=settings || $2::jsonb WHERE id=$1", [exam.quiz, JSON.stringify({ answersReleasedAt: new Date(Date.now()-1000).toISOString() })]);
  });
  await page.reload(); await page.getByRole("button", { name: "Start assessment", exact: true }).click();
  await page.getByRole("radio", { name: "Wash hands", exact: true }).check();
  await page.getByRole("textbox", { name: "Type the safety word" }).fill("safe");
  await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
  await expect(page.getByText("Clean hands protect customers.", { exact: true })).toBeVisible();
  await reviewAssessmentAttempts(page);
  await expect(page.getByText("0 attempt(s) left", { exact: true })).toBeVisible();
  await expect(page.getByText("You have used all attempts for this assessment.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start assessment", exact: true })).toHaveCount(0);
});
