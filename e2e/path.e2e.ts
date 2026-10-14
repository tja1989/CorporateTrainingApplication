import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, capture, expectNoPageOverflow } from "./support";

for (const source of ["path", "rule"] as const) {
test(`PATH: ${source} assignment guards direct entry and unlocks after actual completion @core`, async ({ page }, info) => {
  if (source === "rule") test.setTimeout(90_000);
  const person = await createPerson("LEARNER");
  const path = randomUUID(), first = randomUUID(), second = randomUUID();
  const firstLesson = randomUUID(), secondLesson = randomUUID();
  const title = `QA ordered path ${path.slice(0, 6)}`;
  const rule = randomUUID(), survivingRule = randomUUID();
  const sourceId = source === "path" ? path : rule;
  await withDb(async db => {
    await db.query("INSERT INTO paths(id,title,description,complete_in_order) VALUES ($1,$2,'Two ordered training steps',true)", [path, title]);
    if (source === "rule") {
      const jobTitle = `QA path ${person.employeeId}`;
      await db.query("UPDATE users SET job_title=$1 WHERE id=$2", [jobTitle, person.id]);
      await db.query("INSERT INTO enrollment_rules(id,name,criteria,target_type,target_id,active) VALUES ($1,$2,$3,'path',$4,true),($5,$6,$3,'path',$4,true)", [rule, `${title} original rule`, JSON.stringify({ jobTitle }), path, survivingRule, `${title} surviving rule`]);
    }
    for (const [index, course, lesson] of [[0, first, firstLesson], [1, second, secondLesson]] as const) {
      const module = randomUUID();
      await db.query("INSERT INTO courses(id,title,status,sequential_lock) VALUES ($1,$2,'PUBLISHED',false)", [course, `${title} — Step ${index + 1}`]);
      await db.query("INSERT INTO modules(id,course_id,title,sort) VALUES ($1,$2,'Training',0)", [module, course]);
      await db.query("INSERT INTO lessons(id,module_id,type,title,payload) VALUES ($1,$2,'TEXT',$3,$4)", [lesson, module, `Ordered lesson ${index + 1}`, JSON.stringify({ body: index ? "The second-step training content is now unlocked." : "Finish the first training step before moving to the next course." })]);
      await db.query("INSERT INTO path_courses(id,path_id,course_id,sort) VALUES ($1,$2,$3,$4)", [randomUUID(), path, course, index]);
      await db.query("INSERT INTO enrollments(id,user_id,course_id,source,source_id,status) VALUES ($1,$2,$3,$4,$5,'NOT_STARTED')", [randomUUID(), person.id, course, source, sourceId]);
    }
  });
  if (source === "rule") {
    const originalEnrollments = await withDb(async db => (await db.query("SELECT * FROM enrollments WHERE user_id=$1 ORDER BY id", [person.id])).rows);
    const admin = await createPerson("ADMIN"); await signIn(page, admin); await page.goto("/admin/people?view=rules");
    const row = page.getByRole("listitem").filter({ hasText: `${title} original rule` });
    const dataset = await withDb(async db => (await db.query("SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM enrollment_rules) rules")).rows[0]);
    const started = Date.now();
    const [, response] = await Promise.all([
      page.waitForEvent("load", { timeout: 60_000 }),
      page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/admin/people", { timeout: 60_000 }),
      row.getByRole("button", { name: "disable", exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
    await expect(row.getByRole("button", { name: "enable", exact: true })).toBeVisible();
    await info.attach("bulk-rule-action", { body: JSON.stringify({ dataset, started: new Date(started).toISOString(), finished: new Date().toISOString(), durationMs: Date.now() - started, responseStatus: response.status() }), contentType: "application/json" });
    expect(await withDb(async db => (await db.query("SELECT * FROM enrollments WHERE user_id=$1 ORDER BY id", [person.id])).rows)).toEqual(originalEnrollments);
    await info.attach("overlapping-rule-provenance", { body: JSON.stringify({ originalRule: rule, survivingRule, originalEnrollments }), contentType: "application/json" });
    await page.context().clearCookies();
  }
  await signIn(page, person);
  await page.locator(`a[href="/path/${path}"]`).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await expect(page.locator(`main a[href="/course/${second}"]`)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continue path", exact: true })).toHaveAttribute("href", `/lesson/${firstLesson}`);
  await capture(page, info, "ordered-path-before-completion");

  // Direct route entry is part of the required lock boundary, not a fixture shortcut.
  await page.goto(`/course/${second}`);
  await expect(page.getByRole("heading", { name: `${title} — Step 2`, exact: true })).toBeVisible();
  await expect(page.locator(`main a[href="/lesson/${secondLesson}"]`)).toHaveCount(0);
  await expect(page.locator("main").getByText(/earlier courses|previous course|prerequisite|first course/i).first()).toBeVisible();
  await page.goto(`/lesson/${secondLesson}`);
  await expect(page.getByRole("heading", { name: "Ordered lesson 2", exact: true })).toBeVisible();
  await expect(page.locator("main").getByText(/earlier courses/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark complete", exact: true })).toHaveCount(0);
  await expect(page.getByText("The second-step training content is now unlocked.", { exact: true })).toHaveCount(0);
  const blocked = await withDb(db => db.query("SELECT count(*)::int AS n FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2", [person.id, secondLesson]));
  expect(blocked.rows[0].n).toBe(0);

  await page.goto(`/path/${path}`);
  await page.getByRole("link", { name: "Continue path", exact: true }).click();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lesson completion" }).getByText("Lesson complete", { exact: true })).toBeVisible();
  await page.goto(`/path/${path}`);
  await expect(page.getByRole("progressbar", { name: "1 of 2 courses complete", exact: true })).toHaveAttribute("aria-valuenow", "50");
  await expect(page.locator(`main a[href="/course/${second}"]`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue path", exact: true })).toHaveAttribute("href", `/lesson/${secondLesson}`);
  await page.reload();
  await page.getByRole("link", { name: "Continue path", exact: true }).click();
  await expect(page.getByText("The second-step training content is now unlocked.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lesson completion" }).getByText("Lesson complete", { exact: true })).toBeVisible();
  await page.goto(`/path/${path}`);
  await expect(page.getByRole("progressbar", { name: "2 of 2 courses complete", exact: true })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByText("Locked", { exact: true })).toHaveCount(0);
  await expectNoPageOverflow(page);
  await capture(page, info, "ordered-path-complete");

  // The ordered assignment must not introduce a global enrollment requirement.
  const unassigned = await createPerson("LEARNER");
  await page.context().clearCookies();
  await signIn(page, unassigned);
  await page.goto(`/course/${second}`);
  await expect(page.getByRole("heading", { name: `${title} — Step 2`, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Start course", exact: true }).click();
  await expect(page.getByText("The second-step training content is now unlocked.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark complete", exact: true })).toBeVisible();
});
}
