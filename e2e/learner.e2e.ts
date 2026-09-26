import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, expectNoPageOverflow, capture } from "./support";

async function learningFixture(userId: string, sequential = true) {
  const course = randomUUID(), module = randomUUID(), text = randomUUID(), pdf = randomUUID(), video = randomUUID(), interview = randomUUID(), videoId = randomUUID();
  const title = `QA Learning ${course.slice(0, 6)}`;
  await withDb(async db => {
    await db.query("INSERT INTO courses (id,title,description,status,sequential_lock,language,tags,objectives) VALUES ($1,$2,'Training for the shop floor','PUBLISHED',$3,'en','[\"qa-learning\"]','[\"Serve safely\"]')", [course, title, sequential]);
    await db.query("INSERT INTO modules (id,course_id,title) VALUES ($1,$2,'Getting started')", [module, course]);
    await db.query("INSERT INTO videos (id,youtube_id,title,duration_sec,ingestion_status) VALUES ($1,$2,'QA video',100,'READY')", [videoId, `QA${videoId.slice(0, 9)}`]);
    const items = [[text, "TEXT", "Read the service guide", { body: "# The first step\n\nWelcome customers and follow the safety checklist. Keep aisles clear and ask a supervisor whenever you need help." }], [pdf, "PDF", "Printable service guide", { fileUrl: "/demo/food-safety-hygiene-card.pdf" }], [video, "VIDEO", "Watch the service guide", { videoId }], [interview, "INTERVIEW", "Talk through the service guide", { interview: { scope: "course", questionCount: 3, maxMinutes: 3, passPct: 70, requirePass: true } }]];
    for (let i = 0; i < items.length; i++) await db.query("INSERT INTO lessons (id,module_id,type,title,sort,payload) VALUES ($1,$2,$3,$4,$5,$6)", [items[i][0], module, items[i][1], items[i][2], i, JSON.stringify(items[i][3])]);
    await db.query("INSERT INTO enrollments (id,user_id,course_id,source,status) VALUES ($1,$2,$3,'manual','IN_PROGRESS')", [randomUUID(), userId, course]);
  });
  return { course, module, text, pdf, video, videoId, interview, title };
}

test("@core @template Home resumes directly, text completion unlocks the next lesson and contents stay available", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  const f = await learningFixture(person.id);
  await signIn(page, person);
  const resume = page.getByRole("link", { name: "Continue lesson", exact: true });
  await expect(resume).toHaveAttribute("href", `/lesson/${f.text}`);
  await resume.click();
  await expect(page.getByRole("heading", { name: "Read the service guide", exact: true })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "The first step", level: 2 })).toBeVisible();
  if (page.viewportSize()!.width < 1200) {
    await page.getByRole("button", { name: "Course contents", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Course contents" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Course contents", exact: true })).toBeFocused();
  } else await expect(page.locator("aside").getByRole("navigation", { name: "Course contents" })).toBeVisible();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lesson/${f.text}\\?completed=1`));
  await expect(page.getByRole("link", { name: "Next lesson", exact: true })).toHaveAttribute("href", `/lesson/${f.pdf}`);
  await expect(page.getByRole("link", { name: "Optional oral check", exact: true })).toBeVisible();
  await capture(page, info, "text-completed");
  await expectNoPageOverflow(page);
  await page.getByRole("link", { name: "Next lesson", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Printable service guide", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open document in a new tab" })).toBeVisible();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByRole("link", { name: "Next lesson", exact: true })).toHaveAttribute("href", `/lesson/${f.video}`);
});

test("@core @template Catalog filters survive refresh and Back, and results open the course in one action", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  const f = await learningFixture(person.id);
  await signIn(page, person);
  await page.goto("/learn?view=browse");
  const filters = page.getByRole("search", { name: "Filter courses" });
  await filters.getByLabel("Search courses", { exact: true }).fill(f.title);
  if (page.viewportSize()!.width < 768) await filters.locator("summary").click();
  await filters.getByLabel("Topic", { exact: true }).selectOption("qa-learning");
  await filters.getByLabel("Enrollment status").selectOption("IN_PROGRESS");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: `1 course matching “${f.title}”` })).toBeVisible();
  await page.reload();
  await expect(filters.getByLabel("Search courses", { exact: true })).toHaveValue(f.title);
  await page.getByRole("link", { name: new RegExp(f.title) }).last().click();
  await expect(page.getByRole("heading", { name: f.title, exact: true })).toBeVisible();
  await page.goBack();
  await expect(filters.getByLabel("Topic", { exact: true })).toHaveValue("qa-learning");
  await expectNoPageOverflow(page);
  await capture(page, info, "catalog-filters");
});

test("@core Mocked player restores saved position independently of watched coverage", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  const f = await learningFixture(person.id, false);
  await withDb(db => db.query("INSERT INTO lesson_progress (id,user_id,lesson_id,status,watched_buckets,last_position_sec) VALUES ($1,$2,$3,'IN_PROGRESS','[0,1]',30)", [randomUUID(), person.id, f.video]));
  // The local test verifies our IFrame API contract; it does not qualify YouTube.
  await page.route("https://www.youtube.com/iframe_api", route => route.fulfill({ contentType: "application/javascript", body: `window.YT={Player:function(host,opts){let pos=0;this.seekTo=(p)=>{pos=p;window.qaSeek=p};this.getCurrentTime=()=>pos;this.getPlayerState=()=>1;this.playVideo=()=>{};this.destroy=()=>{};setTimeout(()=>opts.events.onReady(),0)}};window.onYouTubeIframeAPIReady();` }));
  await signIn(page, person);
  await page.goto(`/lesson/${f.video}`);
  await expect.poll(() => page.evaluate(() => (window as Window & { qaSeek?: number }).qaSeek)).toBe(30);
  await expect(page.getByRole("progressbar", { name: "Watch coverage" })).toHaveAttribute("aria-valuenow", "10");
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Transcript", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Transcript" })).toBeVisible();
  await page.getByRole("tab", { name: "Tutor", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Ask the tutor" })).toBeVisible();
  await expect.poll(async () => withDb(async db => (await db.query("SELECT watched_buckets FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2", [person.id, f.video])).rows[0].watched_buckets)).toEqual([0, 1, 6]);
  await expectNoPageOverflow(page);
  await capture(page, info, "video-tutor");
});

test("@core Locked video rejects a direct progress request", async ({ page }) => {
  const person = await createPerson("LEARNER");
  const f = await learningFixture(person.id);
  await signIn(page, person);
  const response = await page.request.post("/api/progress", { data: { lessonId: f.video, positionSec: 95 } });
  expect(response.status()).toBe(403);
  const count = await withDb(async db => (await db.query("SELECT count(*)::int AS n FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2", [person.id, f.video])).rows[0].n);
  expect(count).toBe(0);
});

test("@core @template HR shows its heading, previews the actual escalation payload, and creates a readable ticket", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  const conversation = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO hr_conversations (id,user_id) VALUES ($1,$2)", [conversation, person.id]);
    await db.query("INSERT INTO hr_messages (id,conversation_id,role,content) VALUES ($1,$2,'user','Please help with my leave request.')", [randomUUID(), conversation]);
  });
  await signIn(page, person);
  await page.goto("/ask-hr");
  await expect(page.getByRole("heading", { name: "HR Help", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Talk to a person", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review what you will share with HR" });
  await expect(dialog.getByText(person.name, { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Conversation to share")).toContainText("Employee: Please help with my leave request.");
  await capture(page, info, "hr-escalation-preview");
  await dialog.getByRole("button", { name: "Share and create ticket" }).click();
  await page.getByRole("link", { name: "View your ticket" }).click();
  await page.getByLabel("Reply to HR").fill("My additional information.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Your reply was sent to HR.", { exact: true })).toBeVisible();
  await expect(page.getByText("My additional information.", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
});

test("@core @template Learning path shows prerequisites, profile preserves completed history and inbox has explicit read states", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  const first = await learningFixture(person.id);
  const second = await learningFixture(person.id);
  const path = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO paths (id,title,description,complete_in_order) VALUES ($1,'QA service pathway','Complete these courses in order.',true)", [path]);
    await db.query("INSERT INTO path_courses (id,path_id,course_id,sort) VALUES ($1,$2,$3,0),($4,$2,$5,1)", [randomUUID(), path, first.course, randomUUID(), second.course]);
    await db.query("INSERT INTO notifications (id,user_id,kind,payload) VALUES ($1,$2,'enrolled',$3)", [randomUUID(), person.id, JSON.stringify({ courseId: first.course, courseTitle: first.title })]);
    await db.query("INSERT INTO completion_records (id,user_id,course_id,completed_at) VALUES ($1,$2,$3,now())", [randomUUID(), person.id, second.course]);
  });
  await signIn(page, person);
  await page.goto(`/path/${path}`);
  await expect(page.getByRole("link", { name: "Continue path", exact: true })).toHaveAttribute("href", `/lesson/${first.text}`);
  await expect(page.getByText("Finish the earlier courses in this path to unlock this step.", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await capture(page, info, "learning-path");
  await page.goto("/profile");
  await expect(page.getByRole("region", { name: "Learning history" })).toContainText(second.title);
  await page.goto("/inbox");
  await expect(page.getByText("Unread", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open update" })).toHaveAttribute("href", `/course/${first.course}`);
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("Read", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);
});

test("@core Offline oral-check demo has consent, typed fallback, confirmed result and retake", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  const f = await learningFixture(person.id, false);
  await page.addInitScript(() => { Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => Promise.reject(new DOMException("Test microphone denial", "NotAllowedError")) } }); });
  await signIn(page, person);
  await page.goto(`/lesson/${f.interview}`);
  await expect(page.getByRole("heading", { name: "Before the oral check" })).toBeVisible();
  await expect(page.getByText(/Offline demo mode — no Gemini key/)).toBeVisible();
  await page.getByRole("button", { name: "Start the oral check", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Type a message" });
  await expect(input).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(new RegExp(`Question ${i + 1} of 3\\.`))).toBeVisible();
    await input.fill("Welcome customers and follow the safety checklist.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
  }
  await expect(page.getByText("Your result", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retake", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lesson completion" }).getByText("Lesson complete", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await capture(page, info, "oral-demo-result");
});

test("@core Crossing the video completion threshold keeps the existing player running and unlocks Next lesson", async ({ page }) => {
  const person = await createPerson("LEARNER");
  const f = await learningFixture(person.id);
  await withDb(async db => {
    for (const lesson of [f.text, f.pdf]) await db.query("INSERT INTO lesson_progress (id,user_id,lesson_id,status) VALUES ($1,$2,$3,'COMPLETED')", [randomUUID(), person.id, lesson]);
    await db.query("INSERT INTO lesson_progress (id,user_id,lesson_id,status,watched_buckets,last_position_sec) VALUES ($1,$2,$3,'IN_PROGRESS',$4,85)", [randomUUID(), person.id, f.video, JSON.stringify(Array.from({ length: 17 }, (_, i) => i))]);
  });
  await page.route("https://www.youtube.com/iframe_api", route => route.fulfill({ contentType: "application/javascript", body: `window.qaCreates=0;window.qaDestroys=0;window.YT={Player:function(host,opts){window.qaCreates++;this.seekTo=()=>{};this.getCurrentTime=()=>86;this.getPlayerState=()=>1;this.playVideo=()=>{};this.destroy=()=>window.qaDestroys++;setTimeout(()=>opts.events.onReady(),0)}};window.onYouTubeIframeAPIReady();` }));
  await signIn(page, person);
  await page.goto(`/lesson/${f.video}`);
  await expect(page.getByRole("link", { name: "Next lesson", exact: true })).toHaveAttribute("href", `/lesson/${f.interview}`);
  await expect(page.getByText("Lesson complete", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Optional oral check", exact: true })).toHaveCount(1);
  if (page.viewportSize()!.width < 1200) {
    await page.getByRole("button", { name: "Course contents", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Course contents" }).getByRole("link", { name: /Talk through the service guide/ })).toHaveAttribute("href", `/lesson/${f.interview}`);
  } else await expect(page.locator("aside").getByRole("link", { name: /Talk through the service guide/ })).toHaveAttribute("href", `/lesson/${f.interview}`);
  expect(await page.evaluate(() => ({ creates: (window as Window & { qaCreates?: number }).qaCreates, destroys: (window as Window & { qaDestroys?: number }).qaDestroys }))).toEqual({ creates: 1, destroys: 0 });
});

test("@core Policy citations target readable semantic sections and preserve superseded sources", async ({ page }) => {
  const person = await createPerson("LEARNER"), policy = randomUUID();
  await withDb(db => db.query("INSERT INTO policy_docs (id,title,effective_date,body,status,is_demo) VALUES ($1,'QA leave policy',now(),$2,'SUPERSEDED',true)", [policy, "# Leave & Time Off\n\n## Annual leave\nAsk your manager.\n## Sick leave\nNotify your manager."]));
  await signIn(page, person);
  await page.goto(`/policy/${policy}?section=${encodeURIComponent("Leave & Time Off › Annual leave")}`);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Leave & Time Off", level: 2 })).toBeVisible();
  const section = page.getByRole("heading", { name: "Annual leave", level: 3 });
  await expect(section).toBeFocused();
  await expect(section).toHaveAttribute("data-cited-section", "true");
  await expect(page.getByText("Superseded", { exact: true })).toBeVisible();
  await expect(page.getByText("DEMO — fictional handbook", { exact: true })).toBeVisible();
  await expect(page.getByText("Ask your manager.", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
});

test("@core Offline HR voice starts typing without waiting for microphone permission", async ({ page }) => {
  const person = await createPerson("LEARNER");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => {
      (window as Window & { qaMicCalls?: number }).qaMicCalls = ((window as Window & { qaMicCalls?: number }).qaMicCalls ?? 0) + 1;
      return new Promise(() => {});
    } } });
  });
  await signIn(page, person);
  await page.goto("/ask-hr/live");
  await expect(page.getByText(/Offline demo mode — no Gemini key/)).toBeVisible();
  await page.getByRole("button", { name: "Start talking", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Type a message" });
  await expect(input).toBeEnabled();
  expect(await page.evaluate(() => (window as Window & { qaMicCalls?: number }).qaMicCalls ?? 0)).toBe(0);
  await input.fill("What training is due for me?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByLabel("Transcript", { exact: true }).getByText("What training is due for me?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End conversation", exact: true }).click();
  await expect(page.getByRole("link", { name: "Continue in text", exact: true })).toBeVisible();
  await expect.poll(async () => withDb(async db => (await db.query("SELECT count(*)::int AS n FROM hr_messages m JOIN hr_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='user' AND m.content='What training is due for me?'", [person.id])).rows[0].n)).toBe(1);
});
