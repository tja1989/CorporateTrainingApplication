import { randomUUID } from "node:crypto";
import { decodeJwt, SignJWT } from "jose";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createPerson, QA_PASSWORD, withDb, type Person } from "./support";

async function sharedLogin(page: Page, person: Person, shared = true) {
  await page.goto("/login"); await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD); await page.getByLabel("This is a shared device").setChecked(shared);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/home$/);
}
async function expireHistory(context: BrowserContext) {
  const cookie = (await context.cookies()).find(c => c.name === "ll_session")!;
  const payload = decodeJwt(cookie.value);
  // Signed fixture clock boundary; credential verification itself still runs through the UI.
  const value = await new SignJWT({ ...payload, hrHistoryVerifiedAt: Date.now() - 301_000 }).setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-do-not-use"));
  await context.addCookies([{ ...cookie, value }]);
}
async function historyFixture(userId: string) {
  const conversation = randomUUID(), ticket = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO hr_conversations(id,user_id) VALUES($1,$2)", [conversation, userId]);
    await db.query("INSERT INTO hr_messages(id,conversation_id,role,content) VALUES($1,$2,'user','QA stored confidential conversation')", [randomUUID(), conversation]);
    await db.query("INSERT INTO hr_tickets(id,user_id,conversation_id,subject) VALUES($1,$2,$3,'QA stored confidential ticket')", [ticket, userId, conversation]);
    await db.query("INSERT INTO hr_ticket_messages(id,ticket_id,author_id,body) VALUES($1,$2,$3,'QA stored confidential ticket body')", [randomUUID(), ticket, userId]);
  });
  return { conversation, ticket };
}

test("@core Shared HR history requires credentials across pages and APIs and expires with the verified session", async ({ page, context }) => {
  const learner = await createPerson("LEARNER"), old = await historyFixture(learner.id);
  await sharedLogin(page, learner);
  const initial = decodeJwt((await context.cookies()).find(c => c.name === "ll_session")!.value);
  let historyReads = 0; page.on("request", request => { if (request.method() === "GET" && new URL(request.url()).pathname === "/api/hr") historyReads++; });
  await page.goto("/ask-hr"); await expect(page.getByRole("heading", { name: "Your HR history is private", exact: true })).toBeVisible();
  expect(historyReads).toBe(0); await expect(page.getByText("QA stored confidential ticket", { exact: true })).toHaveCount(0);
  const responses = [
    await page.request.get("/api/hr"), await page.request.get(`/api/hr?conversationId=${old.conversation}`),
    await page.request.get(`/api/hr/escalate?conversationId=${old.conversation}`),
    await page.request.post("/api/hr", { data: { message: "Try old conversation", conversationId: old.conversation } }),
    await page.request.post("/api/hr/feedback", { data: { conversationId: old.conversation, feedback: "up" } }),
    await page.request.post("/api/live/hr/session", { data: { conversationId: old.conversation } }),
    await page.request.post("/api/live/hr/event", { data: { type: "end", conversationId: old.conversation } }),
  ];
  for (const response of responses) { expect(response.status()).toBe(403); expect(await response.text()).not.toContain("QA stored confidential"); }
  await page.goto(`/ask-hr/tickets/${old.ticket}`); await expect(page.getByText("QA stored confidential ticket body", { exact: true })).toHaveCount(0);
  await page.getByLabel("Confirm your password").fill("wrong-qa-password"); await page.getByRole("button", { name: "Verify and open history", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Password is incorrect" })).toBeVisible();
  expect((await page.request.get("/api/hr")).status()).toBe(403);
  await page.getByLabel("Confirm your password").fill(QA_PASSWORD); await page.getByRole("button", { name: "Verify and open history", exact: true }).click();
  await expect(page.getByText("QA stored confidential ticket body", { exact: true })).toBeVisible();
  const verified = decodeJwt((await context.cookies()).find(c => c.name === "ll_session")!.value);
  expect(verified.exp).toBe(initial.exp); expect(verified.uid).toBe(initial.uid); expect(verified.mfa).toBe(initial.mfa); expect(verified.hrHistoryVerifiedAt).toBeGreaterThan(0);
  await page.goto("/ask-hr"); await expect(page.getByText("QA stored confidential conversation", { exact: true })).toBeVisible();
  await expireHistory(context); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/hr")).status()).toBe(403);
  await page.getByLabel("Confirm your password").fill(QA_PASSWORD); await page.getByRole("button", { name: "Verify and open history", exact: true }).click();
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).toBeVisible();
  await expireHistory(context); await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).toHaveCount(0);
  // Advance the browser timer separately from the server's signed credential expiry.
  // No focus/pageshow event is used for this automatic-hide assertion.
  await page.clock.install({ time: new Date() });
  await page.getByLabel("Confirm your password").fill(QA_PASSWORD); await page.getByRole("button", { name: "Verify and open history", exact: true }).click();
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).toBeVisible();
  // Both checks receive a genuine authorized server response before expiry, but
  // delivery is held until the rendered boundary has already expired.
  let releaseStatus!: () => void, captured = 0, delivered = 0;
  const statusGate = new Promise<void>(resolve => { releaseStatus = resolve; });
  await page.route("**/api/hr/reauth*", async route => {
    const response = await route.fetch(); expect(response.status()).toBe(200); captured++;
    await statusGate; await route.fulfill({ response }); delivered++;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => captured).toBe(2);
  await expireHistory(context); await page.clock.fastForward(301_000);
  await expect(page.getByLabel("Confirm your password")).toBeVisible();
  releaseStatus(); await expect.poll(() => delivered).toBe(2); await page.clock.runFor(100);
  await page.unroute("**/api/hr/reauth*");
  await expect(page.locator("summary").filter({ hasText: "Your HR tickets" })).toHaveCount(0);
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Confirm your password")).toBeVisible();
  expect((await page.request.get("/api/hr")).status()).toBe(403);
  await page.locator('summary[aria-label="Profile and account"]').click(); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/); await sharedLogin(page, learner);
  const fresh = decodeJwt((await context.cookies()).find(c => c.name === "ll_session")!.value);
  expect(fresh.hrHistoryVerifiedAt).toBeUndefined(); expect(fresh.activeHrConversationId).toBeUndefined();
  expect((await page.request.get("/api/hr")).status()).toBe(403);
  await page.goto(`/ask-hr/tickets/${old.ticket}`); await expect(page.getByLabel("Confirm your password")).toBeVisible();
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM hr_messages WHERE conversation_id=$1", [old.conversation])).rows[0].n)).toBe(1);
});

test("@core A new shared-device text and voice conversation can create its own ticket without exposing stored history", async ({ page, context }) => {
  const learner = await createPerson("LEARNER"), old = await historyFixture(learner.id); await sharedLogin(page, learner);
  await page.goto("/ask-hr"); await page.getByRole("textbox", { name: "Ask the HR assistant", exact: true }).fill("QA new shared-device text question");
  await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(page.getByText(/Offline demo answer/)).toBeVisible();
  expect((await page.request.get("/api/hr")).status()).toBe(403);
  await page.getByRole("link", { name: "Talk instead", exact: true }).click();
  await page.getByRole("button", { name: "Continue to voice", exact: true }).click();
  await page.getByRole("button", { name: "Start talking", exact: true }).click();
  await page.getByRole("textbox", { name: "Type a message", exact: true }).fill("QA new shared-device voice question"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("QA new shared-device voice question", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End conversation", exact: true }).click(); await page.getByRole("link", { name: "Continue in text", exact: true }).click();
  await expect(page.getByText("QA new shared-device voice question", { exact: true })).toBeVisible();
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Talk to a person", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Review what you will share with HR", exact: true });
  await expect(preview).toContainText("QA new shared-device voice question"); await expect(preview).not.toContainText("QA stored confidential");
  await preview.getByRole("button", { name: "Share and create ticket", exact: true }).click(); await page.getByRole("link", { name: "View your ticket", exact: true }).click();
  await expect(page.getByText(/Employee: QA new shared-device voice question/)).toBeVisible();
  const ticketId = new URL(page.url()).pathname.split("/").at(-1)!;
  const current = decodeJwt((await context.cookies()).find(c => c.name === "ll_session")!.value);
  expect(current.hrHistoryVerifiedAt).toBeUndefined(); expect(current.activeHrConversationId).not.toBe(old.conversation);
  expect(await withDb(async db => (await db.query("SELECT conversation_id FROM hr_tickets WHERE id=$1 AND user_id=$2", [ticketId, learner.id])).rows[0].conversation_id)).toBe(current.activeHrConversationId);
  await page.context().clearCookies(); await sharedLogin(page, learner); await page.goto(`/ask-hr/tickets/${ticketId}`);
  await expect(page.getByLabel("Confirm your password")).toBeVisible(); await expect(page.getByText(/Employee: QA new shared-device voice question/)).toHaveCount(0);
});

test("@core HR tabs hide prior content after another account or a new login replaces their session", async ({ page, context }) => {
  const a = await createPerson("LEARNER"), b = await createPerson("LEARNER"), old = await historyFixture(a.id);
  const other = await context.newPage();
  async function unlock(target: Page) {
    await target.goto("/ask-hr"); await target.getByLabel("Confirm your password").fill(QA_PASSWORD);
    await target.getByRole("button", { name: "Verify and open history", exact: true }).click();
    await expect(target.getByLabel("Confirm your password")).toHaveCount(0);
    await expect(target.getByRole("textbox", { name: "Ask the HR assistant", exact: true })).toBeVisible();
  }
  await sharedLogin(page, a); await unlock(page);
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).toBeVisible();
  const voice = await context.newPage(); await voice.goto("/ask-hr/live");
  await voice.getByRole("button", { name: "Continue to voice", exact: true }).click();
  await voice.getByRole("button", { name: "Start talking", exact: true }).click();
  await voice.getByRole("textbox", { name: "Type a message", exact: true }).fill("QA prior login voice transcript");
  await voice.getByRole("button", { name: "Send", exact: true }).click();
  await expect(voice.getByText("QA prior login voice transcript", { exact: true })).toBeVisible();
  await voice.getByRole("button", { name: "End conversation", exact: true }).click();
  // The old tab stays mounted while actual UI authentication replaces the shared cookie.
  await sharedLogin(other, b, false); await other.goto("/ask-hr");
  await expect(other.getByLabel("Confirm your password")).toHaveCount(0);
  await page.bringToFront();
  const checked = page.waitForResponse(response => new URL(response.url()).pathname === "/api/hr/reauth");
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await (await checked).finished();
  await expect(page.getByText("Checking this session…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).not.toBeVisible();
  expect((await page.request.get(`/api/hr/reauth?conversationId=${old.conversation}`)).status()).toBe(404);
  await voice.bringToFront();
  const voiceChecked = voice.waitForResponse(response => new URL(response.url()).pathname === "/api/hr/reauth");
  await voice.evaluate(() => window.dispatchEvent(new Event("focus"))); await (await voiceChecked).finished();
  await expect(voice.getByText("Checking this session…", { exact: true })).toHaveCount(0);
  await expect(voice.getByText("QA prior login voice transcript", { exact: true })).not.toBeVisible(); await voice.close();

  await sharedLogin(page, a); await unlock(page);
  const firstLogin = decodeJwt((await context.cookies()).find(c => c.name === "ll_session")!.value).loginId;
  await page.goto(`/ask-hr/tickets/${old.ticket}`); await expect(page.getByText("QA stored confidential ticket body", { exact: true })).toBeVisible();
  await sharedLogin(other, a); await unlock(other);
  const newLogin = decodeJwt((await context.cookies()).find(c => c.name === "ll_session")!.value).loginId;
  expect(newLogin).toBeTruthy(); expect(newLogin).not.toBe(firstLogin);
  await page.bringToFront();
  const newLoginChecked = page.waitForResponse(response => new URL(response.url()).pathname === "/api/hr/reauth");
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow"))); await (await newLoginChecked).finished();
  await expect(page.getByText("Checking this session…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("QA stored confidential ticket body", { exact: true })).not.toBeVisible();

  await page.goto(`/ask-hr/tickets/${old.ticket}`); await expect(page.getByText("QA stored confidential ticket body", { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.getByText("QA stored confidential ticket body", { exact: true })).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page.getByText("QA stored confidential ticket body", { exact: true })).toBeVisible();
  await other.close();
});
