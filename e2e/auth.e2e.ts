import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createPerson, signIn, withDb, QA_PASSWORD, capture, expectNoPageOverflow } from "./support";

test("AUTH: invalid credentials retain the employee ID and allow correction @core", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  await page.goto("/login");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /incorrect/i })).toBeVisible();
  await expect(page.getByLabel("Employee ID", { exact: true })).toHaveValue(person.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator("h1")).toBeVisible();
  await capture(page, info, "corrected-sign-in");
});

test("AUTH: privacy acknowledgment persists and protected workspaces reject learners @core", async ({ page }, info) => {
  const person = await createPerson("LEARNER", { privacy: 0 });
  await signIn(page, person);
  await expect(page).toHaveURL(/\/privacy-notice$/);
  await expect(page.locator("h1")).toContainText("welearn");
  await page.getByRole("button", { name: /I understand/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  const notice = await withDb(db => db.query("SELECT privacy_notice_version FROM users WHERE id=$1", [person.id]));
  expect(notice.rows[0].privacy_notice_version).toBe(1);
  for (const route of ["/admin/people", "/team/reports"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("button", { name: /Create rule|Import CSV|Export CSV/ })).toHaveCount(0);
  }
  await capture(page, info, "learner-role-boundary");
});

test("AUTH: admin cannot bypass mandatory MFA setup with a direct URL @core", async ({ page }, info) => {
  const person = await createPerson("ADMIN", { mfaSetup: true });
  await signIn(page, person);
  await expect(page).toHaveURL(/\/login\/mfa-setup$/);
  await page.goto("/admin/people");
  await expect(page).toHaveURL(/\/login\/mfa-setup$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/two-factor|authenticator/i);
  await capture(page, info, "mfa-direct-url-guard");
});

test("AUTH: sign-in and activation controls have accessible names and fit small screens @template @core", async ({ page }, info) => {
  for (const route of ["/login", "/activate"]) {
    await page.goto(route);
    await expect(page.getByLabel("Employee ID", { exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.filter(v => v.impact === "critical" || v.impact === "serious"), JSON.stringify(results.violations, null, 2)).toEqual([]);
    await capture(page, info, route.slice(1));
  }
});
