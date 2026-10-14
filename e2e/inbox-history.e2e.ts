import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb } from "./support";

test("@core Every role can reach older unread notifications and mark the entire inbox read", async ({ page }) => {
  for (const role of ["LEARNER", "MANAGER", "ADMIN"] as const) {
    const user = await createPerson(role);
    await withDb(async db => { for (let i = 0; i < 51; i++) await db.query("INSERT INTO notifications(id,user_id,kind,payload,sent_at,read_at) VALUES($1,$2,'due_soon',$3,$4,$5)", [randomUUID(), user.id, JSON.stringify({ courseTitle: `QA notification ${i}`, days: 7 }), new Date(Date.now() - i * 1000), i === 50 ? null : new Date()]); });
    await page.context().clearCookies(); await signIn(page, user);
    await expect(page.getByRole("link", { name: /Notifications.*1 unread/ })).toBeVisible();
    const path = role === "ADMIN" ? "/admin/inbox" : role === "MANAGER" ? "/team/inbox" : "/inbox";
    await page.goto(path); await expect(page.getByText(/^1 unread/)).toBeVisible();
    await page.getByRole("link", { name: "Older notifications", exact: true }).click();
    await expect(page.getByText(/QA notification 50/)).toBeVisible(); await expect(page.getByText("Unread", { exact: true })).toBeVisible();
    // Wait for the form's own navigation before testing an additional explicit reload.
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Mark all as read", exact: true }).click()]);
    await expect(page.getByText(/^0 unread/)).toBeVisible(); await page.reload();
    await expect(page.getByRole("button", { name: "Mark all as read", exact: true })).toHaveCount(0);
    expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL", [user.id])).rows[0].n)).toBe(0);
    await page.getByRole("link", { name: "Newer notifications", exact: true }).click(); await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
  }
});
