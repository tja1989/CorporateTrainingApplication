import { randomUUID } from "node:crypto";
import { decodeJwt } from "jose";
import { test, expect, type Page } from "@playwright/test";
import { createPerson, QA_PASSWORD, withDb, type Person } from "./support";

async function sharedLogin(page: Page, person: Person, shared = true) {
  await page.goto("/login"); await page.getByLabel("Employee ID", { exact: true }).fill(person.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD); await page.getByLabel("This is a shared device").setChecked(shared);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/home$/);
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

test("@core HR initial history preserves a held control and later questions still follow before private escalation", async ({ page, context }, info) => {
  const learner = await createPerson("LEARNER"), old = await historyFixture(learner.id); await sharedLogin(page, learner);
  await page.goto("/ask-hr"); await page.getByRole("textbox", { name: "Ask the HR assistant", exact: true }).fill("QA new shared-device text question");
  await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(page.getByText(/Offline demo answer/)).toBeVisible();
  const textConversation = decodeJwt((await context.cookies()).find(c => c.name === "ll_session")!.value).activeHrConversationId;
  expect(textConversation).toBeTruthy(); expect(textConversation).not.toBe(old.conversation);
  expect((await page.request.get("/api/hr")).status()).toBe(403);
  // This handoff must fetch a fresh document with the server-issued session grant.
  const [voiceDocument] = await Promise.all([
    page.waitForResponse(response => response.request().isNavigationRequest() && new URL(response.url()).pathname === "/ask-hr/live", { timeout: 10_000 }),
    page.waitForEvent("load"),
    page.getByRole("link", { name: "Talk instead", exact: true }).click(),
  ]);
  expect(voiceDocument.status()).toBe(200);
  await expect(page).toHaveURL(/\/ask-hr\/live$/);
  await page.getByRole("button", { name: "Continue to voice", exact: true }).click();
  await page.getByRole("button", { name: "Start talking", exact: true }).click();
  await page.getByRole("textbox", { name: "Type a message", exact: true }).fill("QA new shared-device voice question"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("QA new shared-device voice question", { exact: true })).toBeVisible();
  // Hold the genuine history response so observation starts before application
  // scrolling, rather than racing a transient animation after content assertions.
  let releaseHistory!: () => void;
  let historyCaptured!: () => void;
  const historyGate = new Promise<void>(resolve => { releaseHistory = resolve; });
  const captured = new Promise<void>(resolve => { historyCaptured = resolve; });
  await page.route(/\/api\/hr\?conversationId=/, async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    historyCaptured();
    await historyGate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "End conversation", exact: true }).click();
  await page.getByRole("link", { name: "Continue in text", exact: true }).click();
  await captured;
  const target = page.getByRole("button", { name: "Talk to a person", exact: true });
  await expect(target).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Loading conversation" })).toBeVisible();
  const talk = page.getByRole("link", { name: "Talk instead", exact: true });
  await talk.hover();
  await page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find(el => el.textContent?.trim() === "Talk instead")!;
    const events: object[] = [];
    (window as any).__hrHistoryGesture = { events, samples: [], link };
    for (const kind of ["pointerdown", "pointerup", "click"]) document.addEventListener(kind, event => {
      const state = (window as any).__hrHistoryGesture;
      state.events.push({ kind, time: performance.now(), scrollY, targetIsLink: event.target instanceof Node && link.contains(event.target), rect: link.getBoundingClientRect().toJSON() });
    }, { capture: true, passive: true });
  });
  const rect = await talk.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  try {
    const down = await page.evaluate(() => (window as any).__hrHistoryGesture.events.find((e: any) => e.kind === "pointerdown"));
    expect(down, "The real pointer must press the enabled in-flow link before history is released").toMatchObject({ targetIsLink: true });
    // This fixed observation interval exercises one held gesture, not a wait for
    // a transient animation window. Sample every frame before and after reveal.
    await page.evaluate(() => {
      const state = (window as any).__hrHistoryGesture;
      state.running = true;
      function sample() {
        state.samples.push({ time: performance.now(), scrollY, rect: state.link.getBoundingClientRect().toJSON() });
        if (state.running) requestAnimationFrame(sample);
      }
      sample();
    });
    releaseHistory();
    await expect(target).toBeEnabled();
    await expect(page.getByRole("region", { name: "HR Assistant", exact: true }).getByText("QA new shared-device voice question", { exact: true })).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 500)));
    const observation = await page.evaluate(() => {
      const state = (window as any).__hrHistoryGesture;
      state.running = false;
      return { events: state.events, samples: state.samples, durationMs: 500, releaseOffLinkCancelsGesture: true };
    });
    await info.attach("hr-history-held-control", { body: JSON.stringify(observation), contentType: "application/json" });
    expect(Math.max(...observation.samples.map((sample: any) => Math.abs(sample.scrollY - down.scrollY))), "Pending and newly revealed history must preserve the reader's viewport during the gesture").toBeLessThanOrEqual(1);
    expect(Math.max(...observation.samples.map((sample: any) => Math.abs(sample.rect.y - down.rect.y))), "The pressed link must stay in place while actual history appears").toBeLessThanOrEqual(1);
  } finally {
    // Cancel this deliberately held link gesture rather than navigating away.
    await page.mouse.move(1, 1);
    await page.mouse.up();
  }
  await expect(page).toHaveURL(/\/ask-hr$/);
  await expect(page.getByText("QA stored confidential conversation", { exact: true })).toHaveCount(0);
  const question = "QA follow a newly sent question: " + "Please explain annual leave eligibility and how to request approval. ".repeat(18);
  let releaseAnswer!: () => void, answerCaptured!: () => void;
  const answerGate = new Promise<void>(resolve => { releaseAnswer = resolve; });
  const capturedAnswer = new Promise<void>(resolve => { answerCaptured = resolve; });
  await page.route("**/api/hr", async route => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    answerCaptured();
    await answerGate;
    await route.fulfill({ response });
  });
  await page.getByRole("textbox", { name: "Ask the HR assistant", exact: true }).fill(question);
  const answered = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/hr");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  try {
    await capturedAnswer;
    await expect(page.getByRole("region", { name: "HR Assistant", exact: true }).getByText(question.trim(), { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Responding…" })).toBeVisible();
    await expect.poll(() => page.locator(".hr-messages > div").last().evaluate(el => el.getBoundingClientRect().bottom <= innerHeight + 1), { message: "Sending a later question resumes follow while its actual answer is pending" }).toBe(true);
    await info.attach("hr-later-question-follow", { body: JSON.stringify(await page.locator(".hr-messages > div").last().evaluate(el => ({ scrollY, viewportHeight: innerHeight, pendingEnd: el.getBoundingClientRect().toJSON() }))), contentType: "application/json" });
  } finally { releaseAnswer(); }
  expect((await answered).status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "Responding…" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Helpful", exact: true })).toBeVisible();
  await target.click();
  const preview = page.getByRole("dialog", { name: "Review what you will share with HR", exact: true });
  await expect(preview).toContainText("QA new shared-device voice question"); await expect(preview).toContainText(question.trim()); await expect(preview).not.toContainText("QA stored confidential");
  await preview.getByRole("button", { name: "Share and create ticket", exact: true }).click(); await page.getByRole("link", { name: "View your ticket", exact: true }).click();
  await expect(page.getByText(/Employee: QA new shared-device voice question/)).toBeVisible();
  const ticketId = new URL(page.url()).pathname.split("/").at(-1)!;
  const current = decodeJwt((await context.cookies()).find(c => c.name === "ll_session")!.value);
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM hr_messages WHERE conversation_id=$1 AND role='user' AND content=$2", [current.activeHrConversationId, question.trim()])).rows[0].n)).toBe(1);
  expect(current.hrHistoryVerifiedAt).toBeUndefined(); expect(current.activeHrConversationId).not.toBe(old.conversation);
  expect(await withDb(async db => (await db.query("SELECT conversation_id FROM hr_tickets WHERE id=$1 AND user_id=$2", [ticketId, learner.id])).rows[0].conversation_id)).toBe(current.activeHrConversationId);
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM hr_messages WHERE conversation_id=$1 AND role='user' AND content=$2", [textConversation, "QA new shared-device text question"])).rows[0].n)).toBe(1);
  await page.context().clearCookies(); await sharedLogin(page, learner); await page.goto(`/ask-hr/tickets/${ticketId}`);
  await expect(page.getByLabel("Confirm your password")).toBeVisible(); await expect(page.getByText(/Employee: QA new shared-device voice question/)).toHaveCount(0);
});
