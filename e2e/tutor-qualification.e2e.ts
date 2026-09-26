import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb } from "./support";

export async function tutorFixture() {
  const course = randomUUID(), module = randomUUID(), lessons = [randomUUID(), randomUUID()], videos = [randomUUID(), randomUUID()];
  await withDb(async db => {
    await db.query("INSERT INTO courses(id,title,status) VALUES($1,'QA tutor scoped course','PUBLISHED')", [course]);
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,'Video sources')", [module, course]);
    for (let i=0; i<2; i++) {
      await db.query("INSERT INTO videos(id,youtube_id,title,duration_sec,ingestion_status) VALUES($1,$2,$3,100,'READY')", [videos[i], `QA${videos[i].slice(0,9)}`, `QA source ${i+1}`]);
      await db.query("INSERT INTO lessons(id,module_id,type,title,sort,payload) VALUES($1,$2,'VIDEO',$3,$4,$5)", [lessons[i], module, `QA video ${i+1}`, i, JSON.stringify({videoId:videos[i]})]);
      await db.query("INSERT INTO video_chunks(id,video_id,start_sec,end_sec,text) VALUES($1,$2,10,20,$3)", [randomUUID(), videos[i], i===0 ? "Wash hands before serving food." : "Inspect extinguishers before an emergency."]);
    }
  });
  return { course, module, lessons, videos };
}

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
