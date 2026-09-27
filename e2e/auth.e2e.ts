import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import bcrypt from "bcryptjs";
import { totpCode } from "../lib/auth/totp";
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
  await expect(page.locator("h1")).toContainText("xprtn");
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

test("AUTH: activation validates matching passwords, persists setup and consumes the code @core", async ({ page }, info) => {
  const person = await createPerson("LEARNER", { privacy: 0 });
  const code = "ABCD-2345";
  const hash = await bcrypt.hash(code, 10);
  await withDb(db => db.query("UPDATE users SET password_state='INVITED',password_hash=NULL,invite_code_hash=$1,invite_expires_at=now()+interval '1 day' WHERE id=$2", [hash, person.id]));
  await page.goto("/activate");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Activation or reset code", { exact: true }).fill(code);
  await page.getByLabel("Choose a password", { exact: true }).fill(QA_PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill("does-not-match");
  await page.getByRole("button", { name: "Save password & sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /don't match/ })).toBeVisible();
  await expect(page.getByLabel("Employee ID", { exact: true })).toHaveValue(person.employeeId);
  await expect(page.getByLabel("Activation or reset code", { exact: true })).toHaveValue(code);
  await page.getByLabel("Confirm password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Save password & sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy-notice$/);
  await page.getByRole("button", { name: /I understand/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  const stored = await withDb(db => db.query("SELECT password_state,invite_code_hash,invite_expires_at FROM users WHERE id=$1", [person.id]));
  expect(stored.rows[0]).toEqual({ password_state: "ACTIVE", invite_code_hash: null, invite_expires_at: null });
  await capture(page, info, "activated-account");
  await page.goto("/activate");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Activation or reset code", { exact: true }).fill(code);
  await page.getByLabel("Choose a password", { exact: true }).fill(QA_PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Save password & sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Activation failed/ })).toBeVisible();
});

test("AUTH: admin setup requires a valid code and configured MFA cannot be replaced from a password session @core", async ({ page }, info) => {
  const person = await createPerson("ADMIN", { mfaSetup: true, privacy: 0 });
  await signIn(page, person);
  const secret = (await page.getByLabel("Authenticator setup key", { exact: true }).textContent())!.trim();
  const validWindow = [-1, 0, 1].map(offset => totpCode(secret, offset));
  const badCode = ["000000", "111111", "222222", "333333"].find(value => !validWindow.includes(value))!;
  await page.getByLabel("Code from your app", { exact: true }).fill(badCode);
  await page.getByRole("button", { name: "Confirm & continue", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /doesn't match/ })).toBeVisible();
  await page.getByLabel("Code from your app", { exact: true }).fill(totpCode(secret));
  await page.getByRole("button", { name: "Confirm & continue", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy-notice$/);
  await page.getByRole("button", { name: /I understand/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  await capture(page, info, "admin-setup-complete");
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/mfa$/);
  await page.goto("/login/mfa-setup");
  await expect(page).toHaveURL(/\/login\/mfa$/);
  const stored = await withDb(db => db.query("SELECT totp_secret FROM users WHERE id=$1", [person.id]));
  expect(stored.rows[0].totp_secret).toBe(secret);
  await page.getByLabel("Authenticator code", { exact: true }).fill(totpCode(secret));
  await page.getByRole("button", { name: "Verify & continue", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("AUTH: sign-in and activation controls have accessible names and fit small screens @template @core", async ({ page, baseURL }, info) => {
  for (const theme of ["light", "dark"]) {
    await page.context().addCookies([{ name: "ll_theme", value: theme, url: baseURL! }]);
    for (const route of ["/login", "/activate"]) {
      await page.goto(route);
      await expect(page).toHaveTitle(/xprtn/);
      await expect(page.getByLabel("Employee ID", { exact: true })).toBeVisible();
      await expectNoPageOverflow(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.filter(v => v.impact === "critical" || v.impact === "serious"), JSON.stringify(results.violations, null, 2)).toEqual([]);
      await capture(page, info, `${route.slice(1)}-${theme}`);
    }
  }
});
