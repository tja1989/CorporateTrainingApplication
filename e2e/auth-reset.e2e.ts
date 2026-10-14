import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, QA_PASSWORD, capture } from "./support";

test("AUTH: manager-issued reset is scoped, audit-logged and consumed through account recovery @core", async ({ page, context }, info) => {
  const manager = await createPerson("MANAGER");
  const otherManager = await createPerson("MANAGER");
  const person = await createPerson("LEARNER", { managerId: manager.id, name: "QA reset recipient" });
  await signIn(page, otherManager);
  await page.goto(`/team/${person.id}`);
  await expect(page.getByRole("button", { name: "Issue password reset code", exact: true })).toHaveCount(0);
  const before = await withDb(db => db.query("SELECT password_state FROM users WHERE id=$1", [person.id]));
  expect(before.rows[0].password_state).toBe("ACTIVE");

  await context.clearCookies();
  await signIn(page, manager);
  await page.locator(`a[href="/team/${person.id}"]`).click();
  await expect(page.getByRole("heading", { name: person.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Issue password reset code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reset code issued", exact: true })).toBeVisible();
  // Read the issued value from the user-facing result, never from its stored hash.
  const code = (await page.locator("main p.font-mono").innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9-]{6,}$/);
  const issued = await withDb(db => db.query("SELECT password_state,password_hash,invite_code_hash,invite_expires_at FROM users WHERE id=$1", [person.id]));
  expect(issued.rows[0].password_state).toBe("INVITED");
  expect(issued.rows[0].password_hash).toBeNull();
  expect(issued.rows[0].invite_code_hash).toBeTruthy();
  expect(issued.rows[0].invite_expires_at.getTime()).toBeGreaterThan(Date.now());
  const audit = await withDb(db => db.query("SELECT user_id FROM ui_events WHERE kind='reset_code_issued' AND payload->>'targetUserId'=$1", [person.id]));
  expect(audit.rows).toEqual([{ user_id: manager.id }]);
  await capture(page, info, "issued-test-account-reset");

  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("incorrect");
  const replacement = `${QA_PASSWORD}-recovered`;
  await page.goto("/activate");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Activation or reset code", { exact: true }).fill(code);
  await page.getByLabel("Choose a password", { exact: true }).fill(replacement);
  await page.getByLabel("Confirm password", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Save password & sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy-notice$/);
  await page.getByRole("button", { name: /I understand/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  const recovered = await withDb(db => db.query("SELECT password_state,invite_code_hash,invite_expires_at FROM users WHERE id=$1", [person.id]));
  expect(recovered.rows[0]).toEqual({ password_state: "ACTIVE", invite_code_hash: null, invite_expires_at: null });

  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await capture(page, info, "recovered-account-new-session");
});
