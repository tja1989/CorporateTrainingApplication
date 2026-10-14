import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { capture, createPerson, expectNoPageOverflow, signIn, withDb } from "./support";

test("@core @template Catalog pagination, language, duration, sort, empty results and Forward retain their URLs", async ({ page }, info) => {
  const learner = await createPerson("LEARNER");
  const token = `Catalog-${randomUUID().slice(0, 8)}`;
  await withDb(async db => {
    for (let i = 0; i < 14; i++) await db.query("INSERT INTO courses(id,title,status,language,est_minutes,tags) VALUES($1,$2,'PUBLISHED',$3,$4,$5)", [randomUUID(), `${token} ${String(i).padStart(2,"0")} العربية हिंदी മലയാളം`, i < 13 ? "ml" : "en", i < 13 ? 10 : 90, JSON.stringify([token])]);
  });
  await signIn(page, learner);
  await page.goto("/learn?view=browse");
  const filters = page.getByRole("search", { name: "Filter courses" });
  await filters.getByLabel("Search courses", { exact: true }).fill(token);
  if (page.viewportSize()!.width < 768) await filters.locator("summary").click();
  await filters.getByLabel("Language", { exact: true }).selectOption("ml");
  await filters.getByLabel("Duration", { exact: true }).selectOption("short");
  await filters.getByLabel("Sort by", { exact: true }).selectOption("duration");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: `13 courses matching “${token}”` })).toBeVisible();
  await page.getByRole("navigation", { name: "Course pages" }).getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  await expect(filters.getByLabel("Language", { exact: true })).toHaveValue("ml");
  await page.goBack();
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await filters.getByLabel("Search courses", { exact: true }).fill(`missing-${token}`);
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No courses match these filters", { exact: true })).toBeVisible();
  await filters.getByRole("link", { name: "Clear filters" }).click();
  await expect(filters.getByLabel("Search courses", { exact: true })).toHaveValue("");
  const views = page.getByRole("navigation", { name: "Learning views" });
  await views.getByRole("link", { name: "My courses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "0 courses", exact: true })).toBeVisible();
  await views.getByRole("link", { name: "Learning paths", exact: true }).click();
  await expect(page.getByText("No learning paths assigned", { exact: true })).toBeVisible();
  await page.reload();
  await expect(views.getByRole("link", { name: "Learning paths", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("main").getByRole("link", { name: "Browse courses", exact: true }).last().click();
  await expect(page).toHaveURL(/view=browse/);
  await expectNoPageOverflow(page);
  await capture(page, info, "catalog-clear-and-views");
});

test("@core Practice locked state explains eligibility and returns to learning", async ({ page }) => {
  await signIn(page, await createPerson("LEARNER"));
  await page.goto("/drill");
  await expect(page.getByText("Practice unlocks after your first lesson", { exact: true })).toBeVisible();
  const link = page.getByRole("main").getByRole("link").filter({ hasText: /learning|course/i }).first();
  await link.click();
  await expect(page).toHaveURL(/\/learn/);
});
