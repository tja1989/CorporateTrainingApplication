import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb } from "./support";

import { tutorFixture } from "./qualification-fixtures";

test("@core Tutor retries a network failure, persists the local answer and routes each citation to its own allowed video", async ({ page }) => {
  const learner = await createPerson("LEARNER"), f = await tutorFixture();
  // This substitutes only the public player's transport. Retrieval, SSE, persistence and citation navigation remain real.
  await page.route("https://www.youtube.com/iframe_api", route => route.fulfill({ contentType: "application/javascript", body: `window.YT={Player:function(host,opts){this.seekTo=(p)=>{window.qaSeek=p};this.getCurrentTime=()=>0;this.getPlayerState=()=>2;this.playVideo=()=>{};this.destroy=()=>{};setTimeout(()=>opts.events.onReady(),0)}};window.onYouTubeIframeAPIReady();` }));
  await signIn(page, learner); await page.goto(`/lesson/${f.lessons[0]}`);
  await page.getByRole("tab", { name: "Tutor", exact: true }).click();
  const tutor = page.getByRole("region", { name: "Lesson Tutor" });
  await page.route("**/api/tutor", route => route.abort("failed"));
  await tutor.getByRole("textbox", { name: "Ask the tutor" }).fill("When should I wash hands?");
  await tutor.getByRole("button", { name: "Send", exact: true }).click();
  await expect(tutor.getByText("The Tutor is unavailable right now.", { exact: true })).toBeVisible();
  await page.unroute("**/api/tutor");
  await tutor.getByRole("textbox", { name: "Ask the tutor" }).fill("When should I wash hands?");
  await tutor.getByRole("button", { name: "Send", exact: true }).click();
  await expect(tutor.getByText(/Offline demo answer/)).toBeVisible();
  await tutor.getByRole("button", { name: "0:10", exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { qaSeek?: number }).qaSeek)).toBe(10);
  await tutor.getByRole("button", { name: "Toggle retrieval scope" }).click();
  await tutor.getByRole("textbox", { name: "Ask the tutor" }).fill("When should I inspect extinguishers?");
  await tutor.getByRole("button", { name: "Send", exact: true }).click();
  const destination = tutor.getByRole("link", { name: /QA video 2.*0:10/ });
  await expect(destination).toHaveAttribute("href", `/lesson/${f.lessons[1]}?t=10`);
  await destination.click();
  await expect(page.getByRole("heading", { name: "QA video 2", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { qaSeek?: number }).qaSeek)).toBe(10);
  await page.reload();
  await page.getByRole("tab", { name: "Tutor", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lesson Tutor" })).toContainText("Inspect extinguishers");
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM tutor_messages m JOIN tutor_threads t ON t.id=m.thread_id WHERE t.user_id=$1 AND m.role='assistant'", [learner.id])).rows[0].n)).toBe(2);
});

test("@core Tutor suggestions reject unpublished, locked and mismatched video destinations", async ({ page }) => {
  const learner = await createPerson("LEARNER"), f = await tutorFixture(), draft = await tutorFixture();
  await withDb(async db => { await db.query("UPDATE courses SET sequential_lock=true WHERE id=$1", [f.course]); await db.query("UPDATE courses SET status='DRAFT' WHERE id=$1", [draft.course]); });
  await signIn(page, learner);
  for (const [lesson, video] of [[f.lessons[1], f.videos[1]], [draft.lessons[0], draft.videos[0]], [f.lessons[0], draft.videos[0]]]) {
    const response = await page.request.get(`/api/tutor/suggest?lessonId=${lesson}&videoId=${video}&pos=10`);
    expect.soft(response.status(), `No suggestions outside allowed lesson ${lesson}`).toBe(404);
    expect.soft(await response.text()).not.toContain('"questions"');
  }
  const allowed = await page.request.get(`/api/tutor/suggest?lessonId=${f.lessons[0]}&videoId=${f.videos[0]}&pos=10`);
  expect(allowed.status()).toBe(200); expect((await allowed.json()).questions.length).toBeGreaterThan(0);
  // Preserve the original videoId+pos API for existing callers, while resolving
  // its lesson permission on the server instead of trusting a video identifier.
  expect.soft((await page.request.get(`/api/tutor/suggest?videoId=${f.videos[0]}&pos=10`)).status()).toBe(200);
  for (const video of [f.videos[1], draft.videos[0]]) expect.soft((await page.request.get(`/api/tutor/suggest?videoId=${video}&pos=10`)).status()).toBe(404);
});

test("@core Stored legacy, missing and out-of-scope Tutor citations retain history without guessing a player; invalid transcript times stay disabled", async ({ page }) => {
  const learner = await createPerson("LEARNER"), f = await tutorFixture(), other = await tutorFixture(), thread = randomUUID();
  const citations = [
    { startSec: 10, endSec: 20, quote: "Legacy source text" },
    { startSec: 10, endSec: 20, quote: "Missing source text", videoId: randomUUID(), lessonId: f.lessons[0] },
    { startSec: 10, endSec: 20, quote: "Other course source text", videoId: other.videos[0], lessonId: other.lessons[0] },
    { startSec: 120, endSec: 130, quote: "Outside the video duration", videoId: f.videos[0], lessonId: f.lessons[0] },
  ];
  await withDb(async db => {
    await db.query("INSERT INTO tutor_threads(id,user_id,course_id,lesson_id) VALUES($1,$2,$3,$4)", [thread, learner.id, f.course, f.lessons[0]]);
    await db.query("INSERT INTO tutor_messages(id,thread_id,role,content,citations) VALUES($1,$2,'assistant','Historical answer remains readable',$3)", [randomUUID(), thread, JSON.stringify(citations)]);
    await db.query("INSERT INTO video_chunks(id,video_id,start_sec,end_sec,text) VALUES($1,$2,120,130,'Authored transcript outside duration remains readable')", [randomUUID(), f.videos[0]]);
  });
  await page.route("https://www.youtube.com/iframe_api", route => route.fulfill({ contentType: "application/javascript", body: `window.YT={Player:function(host,opts){this.seekTo=(p)=>{window.qaSeek=p};this.getCurrentTime=()=>0;this.getPlayerState=()=>2;this.playVideo=()=>{};this.destroy=()=>{};setTimeout(()=>opts.events.onReady(),0)}};window.onYouTubeIframeAPIReady();` }));
  await signIn(page, learner); await page.goto(`/lesson/${f.lessons[0]}`);
  await page.getByRole("tab", { name: "Tutor", exact: true }).click();
  const tutor = page.getByRole("region", { name: "Lesson Tutor", exact: true });
  await expect(tutor).toContainText("Historical answer remains readable");
  await expect(tutor.getByText(/Source unavailable/)).toHaveCount(4);
  await expect(tutor.locator('a[href*="/lesson/"]')).toHaveCount(0);
  await expect(tutor.getByRole("button", { name: /^0:10|2:00$/ })).toHaveCount(0);
  // Keyboard roving focus activates the adjacent Transcript tab.
  await page.evaluate(() => { document.documentElement.dir = "rtl"; });
  await page.getByRole("tab", { name: "Tutor", exact: true }).focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Transcript", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: /Authored transcript outside duration/ })).toBeDisabled();
  expect(await page.evaluate(() => (window as Window & { qaSeek?: number }).qaSeek)).toBeUndefined();
  await page.reload(); await page.getByRole("tab", { name: "Tutor", exact: true }).click();
  await expect(tutor.getByText(/Source unavailable/)).toHaveCount(4);
  expect(await withDb(async db => (await db.query("SELECT citations FROM tutor_messages WHERE thread_id=$1", [thread])).rows[0].citations)).toEqual(citations);
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM lesson_progress WHERE user_id=$1 AND status='COMPLETED'", [learner.id])).rows[0].n)).toBe(0);
});
