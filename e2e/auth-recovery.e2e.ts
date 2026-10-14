import { test, expect } from "@playwright/test";
import { SignJWT, decodeJwt } from "jose";
import bcrypt from "bcryptjs";
import { createPerson, signIn, withDb, QA_PASSWORD } from "./support";

test("AUTH: expired session returns to sign-in and recovers through credentials @core", async ({ page, context }) => {
  const person = await createPerson("LEARNER");
  await signIn(page, person);
  await expect(page).toHaveURL(/\/home$/);
  const cookie = (await context.cookies()).find(item => item.name === "ll_session");
  if (!cookie || !process.env.SESSION_SECRET) throw new Error("Local authenticated fixture is missing");
  // Establish an expired-session prerequisite, then exercise real route guards/UI.
  const expired = await new SignJWT(decodeJwt(cookie.value))
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  await context.addCookies([{ ...cookie, value: expired }]);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('summary[aria-label="Profile and account"]')).toHaveCount(0);
  await signIn(page, person);
  await expect(page).toHaveURL(/\/home$/);
  await page.locator('summary[aria-label="Profile and account"]').click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('summary[aria-label="Profile and account"]')).toHaveCount(0);
});

test("AUTH: wrong and expired activation codes retain entered values and leave account invited @core", async ({ page }) => {
  const person = await createPerson("LEARNER");
  const hash = await bcrypt.hash("QACODE77", 10);
  await withDb(db => db.query("UPDATE users SET password_state='INVITED', password_hash=NULL, invite_code_hash=$2, invite_expires_at=now()+interval '1 day' WHERE id=$1", [person.id, hash]));
  await page.goto("/activate");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Activation or reset code", { exact: true }).fill("BADCODE7");
  await page.getByLabel("Choose a password", { exact: true }).fill(QA_PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Save password & sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Activation failed");
  await expect(page.getByLabel("Employee ID", { exact: true })).toHaveValue(person.employeeId);
  await expect(page.getByLabel("Activation or reset code", { exact: true })).toHaveValue("BADCODE7");
  // Expiration is an independent server-side condition; replacing it is fixture setup.
  await withDb(db => db.query("UPDATE users SET invite_expires_at=now()-interval '1 day' WHERE id=$1", [person.id]));
  await page.getByLabel("Activation or reset code", { exact: true }).fill("QACODE77");
  await page.getByRole("button", { name: "Save password & sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("has expired");
  await expect(page.locator("form").getByRole("alert")).toContainText("Ask your manager");
  const result = await withDb(db => db.query("SELECT password_state,password_hash,invite_code_hash FROM users WHERE id=$1", [person.id]));
  expect(result.rows[0].password_state).toBe("INVITED");
  expect(result.rows[0].password_hash).toBeNull();
  expect(result.rows[0].invite_code_hash).toBe(hash);
});
