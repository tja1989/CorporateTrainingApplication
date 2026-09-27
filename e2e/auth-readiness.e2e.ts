import bcrypt from "bcryptjs";
import { test, expect } from "@playwright/test";
import { totpCode } from "../lib/auth/totp";
import { createPerson, QA_PASSWORD, withDb, capture } from "./support";
import { delayedHydration, releaseAuthHydration } from "./delayed-hydration";

test("@core Early login values survive hydration, shared-device changes and server validation", async ({ browser, baseURL }, info) => {
  const learner = await createPerson("LEARNER"), d = await delayedHydration(browser, baseURL!, info), p = d.page;
  try {
    await p.goto("/login", { waitUntil: "commit" });
    const id = p.getByLabel("Employee ID", { exact: true }), password = p.getByLabel("Password", { exact: true });
    await id.fill(learner.employeeId); await password.fill("incorrect-password");
    const shared = p.getByLabel("This is a shared device"); await shared.check();
    await releaseAuthHydration(p, d.release); await expect(shared).toBeChecked();
    await shared.uncheck(); await shared.check();
    await expect(id).toHaveValue(learner.employeeId); await expect(password).toHaveValue("incorrect-password");
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(p.getByRole("alert").filter({ hasText: /incorrect/i })).toBeVisible();
    await expect(id).toHaveValue(learner.employeeId); await expect(password).toHaveValue("incorrect-password");
    await expect(p.getByLabel("This is a shared device")).toBeChecked();
    await password.fill(QA_PASSWORD); await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(p).toHaveURL(/\/home$/); await p.reload(); await expect(p).toHaveURL(/\/home$/);
    expect((await p.request.get("/api/hr")).status()).toBe(403);
    expect(d.errors).toEqual([]); await capture(p, info, "early-login-corrected");
  } finally { await d.close(); }
});

test("@core Early activation values survive a later field edit and validation before code consumption", async ({ browser, baseURL }, info) => {
  const learner = await createPerson("LEARNER"), code = "ABCD-2345", hash = await bcrypt.hash(code, 10);
  await withDb(db => db.query("UPDATE users SET password_state='INVITED',password_hash=NULL,invite_code_hash=$1,invite_expires_at=now()+interval '1 day' WHERE id=$2", [hash, learner.id]));
  const d = await delayedHydration(browser, baseURL!, info), p = d.page;
  try {
    await p.goto("/activate", { waitUntil: "commit" });
    const id = p.getByLabel("Employee ID", { exact: true }), activation = p.getByLabel("Activation or reset code", { exact: true });
    const password = p.getByLabel("Choose a password", { exact: true }), confirm = p.getByLabel("Confirm password", { exact: true });
    await id.fill(learner.employeeId); await activation.fill(code); await password.fill(QA_PASSWORD); await confirm.fill("initial-mismatch");
    await releaseAuthHydration(p, d.release); await confirm.fill("later-mismatch");
    await expect(id).toHaveValue(learner.employeeId); await expect(activation).toHaveValue(code); await expect(password).toHaveValue(QA_PASSWORD);
    await p.getByRole("button", { name: "Save password & sign in", exact: true }).click();
    await expect(p.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
    await expect(id).toHaveValue(learner.employeeId); await expect(activation).toHaveValue(code); await expect(password).toHaveValue(QA_PASSWORD); await expect(confirm).toHaveValue("later-mismatch");
    await confirm.fill(QA_PASSWORD); await p.getByRole("button", { name: "Save password & sign in", exact: true }).click();
    await expect(p).toHaveURL(/\/privacy-notice$/); await p.getByRole("button", { name: /I understand/ }).click();
    await expect(p).toHaveURL(/\/home$/); await p.reload(); await expect(p).toHaveURL(/\/home$/);
    expect(await withDb(async db => (await db.query("SELECT password_state,invite_code_hash FROM users WHERE id=$1", [learner.id])).rows[0])).toEqual({ password_state: "ACTIVE", invite_code_hash: null });
    expect(d.errors).toEqual([]); await capture(p, info, "early-activation");
  } finally { await d.close(); }
});

test("@core Early MFA setup and verification codes remain editable after server rejection", async ({ page, browser, baseURL }, info) => {
  const admin = await createPerson("ADMIN", { mfaSetup: true });
  async function passwordLogin() {
    await page.goto("/login"); await page.getByLabel("Employee ID", { exact: true }).fill(admin.employeeId);
    await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD); await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\/mfa(?:-setup)?$/);
  }
  let secret = "";
  for (const setup of [true, false]) {
    await page.context().clearCookies(); await passwordLogin();
    const d = await delayedHydration(browser, baseURL!, info, await page.context().storageState()), p = d.page;
    try {
      await p.goto(setup ? "/login/mfa-setup" : "/login/mfa", { waitUntil: "commit" });
      if (setup) secret = (await p.getByLabel("Authenticator setup key", { exact: true }).textContent())!.trim();
      const current = [-1, 0, 1].map(offset => totpCode(secret, offset));
      const bad = ["000000", "111111", "222222", "333333"].find(value => !current.includes(value))!;
      const input = p.getByLabel(setup ? "Code from your app" : "Authenticator code", { exact: true });
      await input.fill(bad); await releaseAuthHydration(p, d.release);
      const submit = p.getByRole("button", { name: setup ? "Confirm & continue" : "Verify & continue", exact: true });
      await submit.click();
      await expect(p.getByRole("alert").filter({ hasText: setup ? "Code doesn't match" : "Incorrect code" })).toBeVisible();
      await expect(input).toHaveValue(bad);
      await input.fill(totpCode(secret)); await submit.click();
      if (setup) {
        await expect(p).toHaveURL(/\/privacy-notice$/); await p.getByRole("button", { name: /I understand/ }).click();
      }
      await expect(p).toHaveURL(/\/admin$/); await p.reload(); await expect(p).toHaveURL(/\/admin$/);
      expect(await withDb(async db => (await db.query("SELECT totp_secret FROM users WHERE id=$1", [admin.id])).rows[0].totp_secret)).toBe(secret);
      expect(d.errors).toEqual([]); await capture(p, info, setup ? "early-mfa-setup" : "early-mfa-verify");
    } finally { await d.close(); }
  }
});

test("@core Native login still submits real FormData and establishes a session without JavaScript", async ({ browser, baseURL }, info) => {
  const learner = await createPerson("LEARNER");
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false,
    ignoreHTTPSErrors: info.project.use.ignoreHTTPSErrors, viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch });
  const page = await context.newPage();
  try {
    await page.goto("/login"); await page.getByLabel("Employee ID", { exact: true }).fill(learner.employeeId);
    await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD); await page.getByLabel("This is a shared device").check();
    const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); expect((await response).status()).toBe(303);
    await expect(page).toHaveURL(/\/home$/); await page.reload(); await expect(page).toHaveURL(/\/home$/);
    expect((await page.request.get("/api/hr")).status()).toBe(403);
    await info.attach("native-form-session", { body: JSON.stringify({ postStatus: 303, destination: new URL(page.url()).pathname, javaScriptEnabled: false }), contentType: "application/json" });
  } finally { await context.close(); }
});
