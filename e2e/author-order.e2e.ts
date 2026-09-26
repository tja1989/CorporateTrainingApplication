import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, capture } from "./support";
import { textCourse } from "./qualification-fixtures";

test("@core @template Module order controls persist in the editor and learner outline without rewriting earned history", async ({ page }, info) => {
  const learner = await createPerson("LEARNER"), admin = await createPerson("ADMIN"), f = await textCourse(learner.id, { certificate: true });
  const module = randomUUID(), lesson = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO modules(id,course_id,title,sort) VALUES($1,$2,'Follow-up module',1)", [module, f.course]);
    await db.query("INSERT INTO lessons(id,module_id,type,title,payload) VALUES($1,$2,'TEXT','Follow-up checklist',$3)", [lesson, module, JSON.stringify({ body: "Read the follow-up checklist." })]);
  });
  await signIn(page, learner);
  for (const id of [f.lesson, lesson]) { await page.goto(`/lesson/${id}`); await page.getByRole("button", { name: "Mark complete", exact: true }).click(); await expect(page.getByText("Lesson complete", { exact: true })).toBeVisible(); }
  const history = await withDb(async db => ({ completion: (await db.query("SELECT * FROM completion_records WHERE user_id=$1 AND course_id=$2", [learner.id, f.course])).rows, certificate: (await db.query("SELECT * FROM certificates WHERE user_id=$1 AND course_id=$2", [learner.id, f.course])).rows }));
  expect(history.certificate).toHaveLength(1);
  await page.context().clearCookies(); await signIn(page, admin); await page.goto(`/admin/courses/${f.course}`);
  await expect(page.getByRole("button", { name: "Move module Qualification module up", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move module Follow-up module down", exact: true })).toBeDisabled();
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Move module Follow-up module up", exact: true }).click()]);
  await page.reload();
  const titles = page.getByRole("heading", { name: /^(Qualification module|Follow-up module)$/ });
  await expect(titles).toHaveText(["Follow-up module", "Qualification module"]);
  await expect(page.getByRole("button", { name: "Move module Follow-up module up", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move module Qualification module down", exact: true })).toBeDisabled();
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Move module Follow-up module down", exact: true }).click()]);
  await expect(titles).toHaveText(["Qualification module", "Follow-up module"]);
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Move module Follow-up module up", exact: true }).click()]);
  await expect(titles).toHaveText(["Follow-up module", "Qualification module"]);
  await capture(page, info, "module-order-editor");
  await page.context().clearCookies(); await signIn(page, learner); await page.goto(`/course/${f.course}`);
  const links = page.locator(`main a[href='/lesson/${lesson}'],main a[href='/lesson/${f.lesson}']`);
  await expect(links).toHaveCount(2);
  const ids = await links.evaluateAll(anchors => anchors.map(a => a.getAttribute("href")));
  expect(ids.indexOf(`/lesson/${lesson}`)).toBeLessThan(ids.indexOf(`/lesson/${f.lesson}`));
  await expect(page.getByRole("link", { name: /certificate/i })).toBeVisible();
  expect(await withDb(async db => ({ completion: (await db.query("SELECT * FROM completion_records WHERE user_id=$1 AND course_id=$2", [learner.id, f.course])).rows, certificate: (await db.query("SELECT * FROM certificates WHERE user_id=$1 AND course_id=$2", [learner.id, f.course])).rows }))).toEqual(history);
  expect(await withDb(async db => (await db.query("SELECT id FROM modules WHERE course_id=$1 ORDER BY sort", [f.course])).rows.map(row => row.id))).toEqual([module, f.module]);
  await capture(page, info, "module-order-learner");
});
