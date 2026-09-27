import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, QA_PASSWORD, capture } from "./support";
import { textCourse } from "./qualification-fixtures";
import { delayedHydration } from "./delayed-hydration";

async function storedTicket(userId: string) {
  const conversation = randomUUID(), ticket = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO hr_conversations(id,user_id) VALUES($1,$2)", [conversation, userId]);
    await db.query("INSERT INTO hr_tickets(id,user_id,conversation_id,subject) VALUES($1,$2,$3,'QA initial form ticket')", [ticket, userId, conversation]);
    await db.query("INSERT INTO hr_ticket_messages(id,ticket_id,author_id,body) VALUES($1,$2,$3,'QA stored private ticket message')", [randomUUID(), ticket, userId]);
  });
  return ticket;
}

test("@core Ticket reply waits for its handler, retains failed input and persists exactly one retry", async ({ page, browser, baseURL }, info) => {
  const learner = await createPerson("LEARNER"), ticket = await storedTicket(learner.id);
  await signIn(page, learner);
  const d = await delayedHydration(browser, baseURL!, info, await page.context().storageState()), p = d.page;
  let fail = true;
  await d.context.route(`**/ask-hr/tickets/${ticket}`, route => route.request().method() === "POST" && fail ? route.abort("failed") : route.continue());
  try {
    await p.goto(`/ask-hr/tickets/${ticket}`, { waitUntil: "commit" });
    const input = p.getByLabel("Reply to HR"), send = p.getByRole("button", { name: "Send reply", exact: true });
    await expect(input).toBeDisabled(); await expect(send).toBeDisabled();
    await expect(p.getByRole("status").filter({ hasText: "Loading reply form" })).toBeVisible();
    d.release(); await expect(input).toBeEnabled();
    const body = "My additional information survives a failed request.";
    await input.fill(body); await send.click();
    await expect(p.getByRole("status").filter({ hasText: "could not be sent" })).toBeVisible();
    await expect(input).toHaveValue(body); await expect(send).toBeEnabled();
    fail = false; await send.click();
    await expect(p.getByText("Your reply was sent to HR.", { exact: true })).toBeVisible();
    await expect(p.getByText(body, { exact: true })).toBeVisible();
    await expect(input).toBeEnabled(); await p.waitForLoadState("load");
    // Settle background prefetch before the independent persistence reload.
    await p.waitForLoadState("networkidle"); await p.reload();
    await expect(p.getByText(body, { exact: true })).toBeVisible();
    expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM hr_ticket_messages WHERE ticket_id=$1 AND body=$2", [ticket, body])).rows[0].n)).toBe(1);
    expect(d.errors).toEqual([]); await capture(p, info, "reply-persisted");
  } finally { await d.close(); }
});

test("@core HR history unlock waits for its handler and preserves credentials through rejected verification", async ({ page, browser, baseURL }, info) => {
  const learner = await createPerson("LEARNER"), ticket = await storedTicket(learner.id);
  await page.goto("/login"); await page.getByLabel("Employee ID", { exact: true }).fill(learner.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD); await page.getByLabel("This is a shared device").check();
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/home$/);
  const d = await delayedHydration(browser, baseURL!, info, await page.context().storageState()), p = d.page;
  try {
    await p.goto(`/ask-hr/tickets/${ticket}`, { waitUntil: "commit" });
    const input = p.getByLabel("Confirm your password"), submit = p.getByRole("button", { name: "Verify and open history", exact: true });
    await expect(input).toBeDisabled(); await expect(submit).toBeDisabled();
    await expect(p.getByRole("status").filter({ hasText: "Loading verification form" })).toBeVisible();
    await expect(p.getByText("QA stored private ticket message", { exact: true })).toHaveCount(0);
    d.release(); await expect(input).toBeEnabled();
    await input.fill("wrong-qa-password"); await submit.click();
    await expect(p.getByRole("alert").filter({ hasText: "Password is incorrect" })).toBeVisible();
    await expect(input).toHaveValue("wrong-qa-password"); expect((await p.request.get("/api/hr")).status()).toBe(403);
    await input.fill(QA_PASSWORD); await submit.click();
    await expect(p.getByText("QA stored private ticket message", { exact: true })).toBeVisible();
    await expect(p.getByLabel("Reply to HR")).toBeEnabled(); await p.waitForLoadState("load");
    // Settle background prefetch before the independent persistence reload.
    await p.waitForLoadState("networkidle"); await p.reload();
    await expect(p.getByText("QA stored private ticket message", { exact: true })).toBeVisible();
    expect(d.errors).toEqual([]); await capture(p, info, "history-opened");
  } finally { await d.close(); }
});

test("@core Lesson completion waits for its handler and retries a failed save without losing the action", async ({ page, browser, baseURL }, info) => {
  const learner = await createPerson("LEARNER"), f = await textCourse(learner.id);
  await signIn(page, learner);
  const d = await delayedHydration(browser, baseURL!, info, await page.context().storageState()), p = d.page;
  let fail = true;
  await d.context.route(`**/lesson/${f.lesson}`, route => route.request().method() === "POST" && fail ? route.abort("failed") : route.continue());
  try {
    await p.goto(`/lesson/${f.lesson}`, { waitUntil: "commit" });
    const submit = p.getByRole("button", { name: "Mark complete", exact: true });
    await expect(submit).toBeDisabled(); await expect(p.getByRole("status").filter({ hasText: "Loading completion control" })).toBeVisible();
    d.release(); await expect(submit).toBeEnabled(); await submit.click();
    await expect(p.getByRole("alert").filter({ hasText: "could not be confirmed" })).toBeVisible();
    expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2 AND status='COMPLETED'", [learner.id, f.lesson])).rows[0].n)).toBe(0);
    fail = false; await submit.click(); await expect(p.getByText("Lesson complete", { exact: true })).toBeVisible(); await p.reload();
    await expect(p.getByText("Lesson complete", { exact: true })).toBeVisible();
    expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2 AND status='COMPLETED'", [learner.id, f.lesson])).rows[0].n)).toBe(1);
    expect(d.errors).toEqual([]); await capture(p, info, "completion-retried");
  } finally { await d.close(); }
});
