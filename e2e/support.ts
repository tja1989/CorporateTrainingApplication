import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { loadEnv } from "../lib/env";
import { totpCode } from "../lib/auth/totp";

loadEnv();
export const QA_PASSWORD = "welearn-qa-only-2026";
// Test-only authenticator seed. Never assigned to a real or demo account.
export const QA_TOTP = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export function assertLocalQa() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
  const base = new URL(process.env.QA_BASE ?? "https://localhost:3443");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/welearn_")) {
    throw new Error("Fixtures require a dedicated local database named welearn_*.");
  }
  if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Fixtures require a local application.");
}

export async function withDb<T>(run: (db: Client) => Promise<T>): Promise<T> {
  assertLocalQa();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try { return await run(db); } finally { await db.end(); }
}

export type Person = { id: string; employeeId: string; name: string; role: "LEARNER" | "MANAGER" | "ADMIN"; totpSecret: string | null };

/** Create prerequisites only. Operations being qualified must still run through UI. */
export async function createPerson(role: Person["role"], options: { managerId?: string; privacy?: number; mfaSetup?: boolean; name?: string } = {}): Promise<Person> {
  const id = randomUUID();
  const employeeId = `QA${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const person: Person = { id, employeeId, role, name: options.name ?? `QA ${role.toLowerCase()}`, totpSecret: role === "ADMIN" && !options.mfaSetup ? QA_TOTP : null };
  const hash = await bcrypt.hash(QA_PASSWORD, 10);
  await withDb(db => db.query(
    `INSERT INTO users (id, employee_id, name, role, password_state, password_hash, privacy_notice_version, totp_secret, manager_id, store_id)
     VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6,$7,$8,(SELECT id FROM org_units WHERE type='store' ORDER BY name LIMIT 1))`,
    [id, employeeId, person.name, role, hash, options.privacy ?? 1, person.totpSecret, options.managerId ?? null],
  ));
  return person;
}

export async function signIn(page: Page, person: Person) {
  await page.goto("/login");
  await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(url => url.pathname !== "/login");
  if (new URL(page.url()).pathname === "/login/mfa") {
    if (!person.totpSecret) throw new Error("Known-MFA fixture missing its authenticator seed");
    await page.locator('input[name="code"]').fill(totpCode(person.totpSecret));
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.pathname !== "/login/mfa");
  }
}

export async function capture(page: Page, testInfo: TestInfo, label: string, options: { viewportOnly?: boolean } = {}) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio }));
  const oversized = dimensions.height > 16384 || dimensions.width * dimensions.height * dimensions.dpr ** 2 > 16_000_000;
  const previousScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  if (testInfo.project.name !== "chromium-native-zoom" && !oversized && !options.viewportOnly) {
    // A full-page image of a scrolled page paints sticky headers at the old offset.
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  let screenshot: Buffer;
  if (testInfo.project.name === "chromium-native-zoom") {
    // Playwright's clip calculation shifts scrolled content at native zoom.
    // Chromium's un-clipped viewport capture matches the observed CSS geometry.
    const session = await page.context().newCDPSession(page);
    try {
      const captured = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      screenshot = Buffer.from(captured.data, "base64");
    } finally { await session.detach(); }
  } else screenshot = await page.screenshot({ fullPage: !oversized && !options.viewportOnly, animations: "disabled" });
  const captureMethod = testInfo.project.name === "chromium-native-zoom" ? "CDP viewport" : oversized || options.viewportOnly ? "Playwright viewport" : "Playwright full page";
  await testInfo.attach(`${label}-capture`, { body: JSON.stringify({ dimensions, previousScroll, captureScroll: await page.evaluate(() => ({ x: scrollX, y: scrollY })), captureMethod, reason: oversized ? "Document exceeds the 16M pixel / 16384px capture budget; assertions and DOM trace remain complete." : options.viewportOnly ? "Focused viewport evidence" : null }), contentType: "application/json" });
  const path = testInfo.outputPath(`${label}.png`);
  await writeFile(path, screenshot);
  await testInfo.attach(label, { path, contentType: "image/png" });
}

export async function expectNoPageOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(sizes.content, "Only labeled table regions may scroll horizontally; the page must fit").toBeLessThanOrEqual(sizes.viewport + 1);
}
