import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, QA_PASSWORD } from "./support";
import { textCourse, smallQuiz } from "./qualification-fixtures";

test("@core Certificate and learner API data require completed MFA and privacy acknowledgment", async ({ page }) => {
  const learner = await createPerson("LEARNER"), admin = await createPerson("ADMIN"), unconsented = await createPerson("LEARNER", { privacy: 0 });
  const f = await textCourse(learner.id), certificate = randomUUID();
  await withDb(db => db.query("INSERT INTO certificates(id,user_id,course_id,serial) VALUES($1,$2,$3,$4)", [certificate,learner.id,f.course,`QA-${certificate}`]));
  await page.goto("/login");
  await page.getByLabel("Employee ID", { exact: true }).fill(admin.employeeId);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/mfa$/);
  for (const url of [`/api/certificates/${certificate}`, "/api/hr", "/api/hr/reauth", "/api/drill", "/api/tutor/suggest?videoId=missing"]) {
    const response = await page.request.get(url, { maxRedirects: 0 });
    expect([401,403,307]).toContain(response.status());
    const payload = await response.text();
    expect(payload).not.toContain("%PDF"); expect(payload).not.toContain(learner.id);
    expect(payload).not.toMatch(/"(?:messages|sessionId|suggestions|questions)"/);
  }
  const pendingMfaReauth = await page.request.post("/api/hr/reauth", { data: { password: QA_PASSWORD } });
  expect([401,403]).toContain(pendingMfaReauth.status()); expect(await pendingMfaReauth.text()).not.toContain("expiresAt");
  await page.context().clearCookies(); await signIn(page, unconsented);
  await expect(page).toHaveURL(/\/privacy-notice$/);
  for (const url of ["/api/hr", "/api/hr/reauth", "/api/drill", "/api/tutor/suggest?videoId=missing"]) {
    const response = await page.request.get(url, { maxRedirects: 0 });
    expect([401,403,307]).toContain(response.status());
    const payload = await response.text();
    expect(payload).not.toContain("%PDF"); expect(payload).not.toContain(learner.id);
    expect(payload).not.toMatch(/"(?:messages|sessionId|suggestions|questions)"/);
  }
  const pendingPrivacyReauth = await page.request.post("/api/hr/reauth", { data: { password: QA_PASSWORD } });
  expect([401,403]).toContain(pendingPrivacyReauth.status()); expect(await pendingPrivacyReauth.text()).not.toContain("expiresAt");
  await page.context().clearCookies(); await signIn(page, learner);
  const owned = await page.request.get(`/api/certificates/${certificate}`);
  expect(owned.status()).toBe(200); expect((await owned.body()).subarray(0,4).toString()).toBe("%PDF");
  expect((await page.request.get("/api/hr")).status()).toBe(200);
  expect((await page.request.get("/api/hr/reauth")).status()).toBe(200);
  expect((await page.request.get("/api/drill")).status()).toBe(200);
  await page.context().clearCookies(); await signIn(page, admin);
  expect((await page.request.get(`/api/certificates/${certificate}`)).status()).toBe(200);
});

test("Root follows the authenticated workspace; the local health endpoint reports its real database check", async ({ page }) => {
  await page.goto("/"); await expect(page).toHaveURL(/\/login$/);
  for (const [role, route] of [["LEARNER", "/home"], ["MANAGER", "/team"], ["ADMIN", "/admin"]] as const) {
    await page.context().clearCookies(); await signIn(page, await createPerson(role)); await page.goto("/");
    expect(new URL(page.url()).pathname).toBe(route);
  }
  const response = await page.request.get("/api/health"); expect(response.status()).toBe(200);
  const health = await response.json(); expect(health.databasePing).toBe("ok"); expect(health.seededUsers).toBeGreaterThan(0);
  expect(health.aiConfigured).toBe(false); expect(health.voiceConfigured).toBe(false);
});

test("API-only legacy attempt appeal preserves the first decision, creates one pending review and denies another learner", async ({ page }) => {
  const learner = await createPerson("LEARNER"), outsider = await createPerson("LEARNER"), q = await smallQuiz(), attempt = randomUUID(), review = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO attempts(id,user_id,quiz_id,state,grading_state,served_items) VALUES($1,$2,$3,'GRADED','FINAL','[]')", [attempt, learner.id, q.quiz]);
    await db.query("INSERT INTO grading_reviews(id,attempt_id,question_id,ai_scores,ai_rationale,ai_confidence,reason,state) VALUES($1,$2,$3,'[]','QA historical review',0.3,'low_conf','CONFIRMED')", [review, attempt, q.questions[0]]);
  });
  await signIn(page, outsider); expect((await page.request.post(`/api/attempt/${attempt}/appeal`)).status()).toBe(404);
  await page.context().clearCookies(); await signIn(page, learner);
  expect((await page.request.post(`/api/attempt/${attempt}/appeal`)).status()).toBe(200);
  expect((await page.request.post(`/api/attempt/${attempt}/appeal`)).status()).toBe(400);
  expect(await withDb(async db => (await db.query("SELECT state FROM grading_reviews WHERE id=$1", [review])).rows[0].state)).toBe("CONFIRMED");
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM grading_reviews WHERE attempt_id=$1 AND reason='appeal' AND state='PENDING'", [attempt])).rows[0].n)).toBe(1);
});

test("DSR export and erasure operate only on the disposable subject and deny non-admin callers", async ({ page }, info) => {
  const admin = await createPerson("ADMIN"), subject = await createPerson("LEARNER"), other = await createPerson("LEARNER");
  const f = await textCourse(subject.id, { certificate: true });
  await signIn(page, subject); await page.goto(`/lesson/${f.lesson}`);
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByText("Lesson complete", { exact: true })).toBeVisible();
  const denied = await page.request.get(`/api/admin/dsr/${other.id}`, { maxRedirects: 0 });
  expect(denied.status()).toBe(307);
  await page.context().clearCookies(); await signIn(page, admin);
  // These are existing API-only administrative operations: no UI control exists.
  const exported = await page.request.get(`/api/admin/dsr/${subject.id}`);
  expect(exported.ok()).toBe(true);
  const data = await exported.json();
  expect(data.profile.id).toBe(subject.id); expect(data.profile.passwordHash).toBeUndefined(); expect(data.profile.totpSecret).toBeUndefined();
  expect(data.certificates).toHaveLength(1); expect(data.completionRecords).toHaveLength(1);
  const before = await withDb(async db => (await db.query("SELECT name,employee_id,erased_at FROM users WHERE id=$1",[other.id])).rows[0]);
  expect((await page.request.delete(`/api/admin/dsr/${subject.id}`)).ok()).toBe(true);
  const stored = await withDb(async db => (await db.query("SELECT name,erased_at,password_hash FROM users WHERE id=$1",[subject.id])).rows[0]);
  expect(stored.name).toBe("Former colleague"); expect(stored.erased_at).not.toBeNull(); expect(stored.password_hash).toBeNull();
  expect(await withDb(async db => (await db.query("SELECT name,employee_id,erased_at FROM users WHERE id=$1",[other.id])).rows[0])).toEqual(before);
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM completion_records WHERE user_id=$1",[subject.id])).rows[0].n)).toBe(1);
  await page.context().clearCookies(); await page.goto("/login");
  await page.getByLabel("Employee ID", { exact: true }).fill(subject.employeeId); await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("alert").filter({hasText:/Employee ID|password/})).toBeVisible();
  await info.attach("api-only-dsr-evidence", {body:JSON.stringify({subject:subject.id,unrelated:other.id,retainedCompletion:data.completionRecords[0].id,apiOnly:true}),contentType:"application/json"});
});
