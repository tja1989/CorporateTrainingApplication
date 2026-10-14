import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, expectNoPageOverflow, capture } from "./support";

test("@core PDF fallback delivers the document and completion survives refresh", async ({ page }, info) => {
  const learner = await createPerson("LEARNER");
  const course = randomUUID(), module = randomUUID(), lesson = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO courses (id,title,status) VALUES ($1,$2,'PUBLISHED')", [course, `QA PDF ${course.slice(0, 6)}`]);
    await db.query("INSERT INTO modules (id,course_id,title) VALUES ($1,$2,'Reference material')", [module, course]);
    await db.query("INSERT INTO lessons (id,module_id,type,title,payload) VALUES ($1,$2,'PDF','Printable hygiene reference',$3)", [lesson, module, JSON.stringify({ fileUrl: "/demo/food-safety-hygiene-card.pdf" })]);
    await db.query("INSERT INTO enrollments (id,user_id,course_id,source,status) VALUES ($1,$2,$3,'manual','IN_PROGRESS')", [randomUUID(), learner.id, course]);
  });
  await signIn(page, learner);
  await page.goto(`/lesson/${lesson}`);
  await expect(page.getByRole("heading", { name: "Printable hygiene reference", exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="Printable hygiene reference"]')).toBeVisible();

  // Headless engines download PDFs. Verify the actual fallback action and bytes;
  // this is document delivery evidence, not a claim of native inline rendering.
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Open document in a new tab", exact: true }).click();
  const download = await downloaded;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe("food-safety-hygiene-card.pdf");
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const expected = await readFile("public/demo/food-safety-hygiene-card.pdf");
  const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  expect(sha256(bytes)).toBe(sha256(expected));
  await info.attach("delivered-reference.pdf", { body: bytes, contentType: "application/pdf" });

  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lesson completion", exact: true })).toContainText("Lesson complete");
  await page.reload();
  await expect(page.getByRole("region", { name: "Lesson completion", exact: true })).toContainText("Lesson complete");
  const persisted = await withDb(db => db.query("SELECT status FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2", [learner.id, lesson]));
  expect(persisted.rows).toEqual([{ status: "COMPLETED" }]);
  await expectNoPageOverflow(page);
  await capture(page, info, "pdf-delivered-and-completed");
});
