import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { capture, createPerson, expectNoPageOverflow, signIn, withDb } from "./support";

for (const theme of ["light", "dark"]) {
  test(`SHELL: compact lesson and recovery surface in ${theme} theme @template`, async ({ page, context, baseURL }, info) => {
    await context.addCookies([{ name: "ll_theme", value: theme, url: baseURL! }]);
    const person = await createPerson("LEARNER");
    await signIn(page, person);
    const lesson = await withDb(async db => (await db.query("SELECT l.id,l.title FROM lessons l JOIN modules m ON m.id=l.module_id JOIN courses c ON c.id=m.course_id WHERE c.status='PUBLISHED' ORDER BY c.title,m.sort,l.sort LIMIT 1")).rows[0]);
    await page.goto(`/lesson/${lesson.id}`);
    await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    await expect(page.getByRole("banner").getByRole("link", { name: "My Learning", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Mobile main", exact: true })).toHaveCount(0);
    await expectNoPageOverflow(page);
    const shell = await new AxeBuilder({ page }).include("header").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(shell.violations.filter(v => ["serious", "critical"].includes(v.impact ?? "")), JSON.stringify(shell.violations)).toEqual([]);
    await capture(page, info, `compact-lesson-${theme}`);
    await page.goto("/qa-page-that-does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    await expectNoPageOverflow(page);
    const recovery = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(recovery.violations.filter(v => ["serious", "critical"].includes(v.impact ?? "")), JSON.stringify(recovery.violations)).toEqual([]);
    await capture(page, info, `system-recovery-${theme}`);
    await page.getByRole("link", { name: "Go home", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
  });
}
