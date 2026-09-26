import { randomUUID } from "node:crypto";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { createPerson, signIn, withDb, expectNoPageOverflow, capture } from "./support";

async function saveAndReload(page: Page, button: Locator) { await Promise.all([page.waitForEvent("load"), button.click()]); }
const reports = ["completion", "compliance", "transcript", "cert_expiry", "engagement", "quiz_results"];
async function freshSignIn(page: Page, person: Awaited<ReturnType<typeof createPerson>>) { await page.context().clearCookies(); await signIn(page, person); }

test("@core @template Admin publishes, manager assigns, learner earns a certificate and both reports show the same completion", async ({ page }, info) => {
  test.setTimeout(150_000);
  const admin = await createPerson("ADMIN"), manager = await createPerson("MANAGER");
  const learner = await createPerson("LEARNER", { managerId: manager.id, name: `QA chain learner ${randomUUID().slice(0,6)}` });
  const title = `QA published course ${randomUUID().slice(0,8)}`;
  await signIn(page, admin);
  await page.getByRole("link", { name: "Create a course", exact: true }).click();
  const form = page.getByRole("region", { name: "New course", exact: true });
  await form.getByLabel("Title", { exact: true }).fill(title);
  await form.getByLabel("Description").fill("A locally qualified training journey.");
  await form.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/courses\/[^/?]+$/);
  const courseId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Course settings", exact: true })).toBeVisible();
  await page.getByLabel("Cover image URL").fill("javascript:bad");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("image URL");
  await expect(page.getByLabel("Course title")).toHaveValue(title);
  await page.getByLabel("Cover image URL").fill("");
  await page.getByLabel("Issue certificate on completion").check();
  await page.getByLabel("Certificate validity (days)", { exact: true }).fill("30");
  await saveAndReload(page, page.getByRole("button", { name: "Save settings" }));
  await expect.poll(async () => withDb(async db => (await db.query("SELECT certificate_enabled FROM courses WHERE id=$1", [courseId])).rows[0].certificate_enabled)).toBe(true);
  await page.getByRole("link", { name: "Curriculum", exact: true }).click();
  await page.getByLabel("New module title").fill("Service essentials");
  await saveAndReload(page, page.getByRole("button", { name: "Add module", exact: true }));
  await page.getByText("Add lesson to Service essentials", { exact: true }).click();
  await page.getByLabel("Lesson title", { exact: true }).fill("Welcome and help the customer");
  await page.getByLabel("Lesson content", { exact: true }).fill("# Service checklist\n\nWelcome the customer, listen carefully, and ask your supervisor when you need support.");
  await saveAndReload(page, page.getByRole("button", { name: "Add lesson", exact: true }));
  await expect(page.getByText("Welcome and help the customer", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await capture(page, info, "admin-curriculum");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await saveAndReload(page, page.getByRole("button", { name: "Publish", exact: true }));
  await expect(page.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View learner course", exact: true }).click();
  await expect(page).toHaveURL(`/course/${courseId}`);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await freshSignIn(page, manager);
  await page.getByLabel("Search team").fill(learner.employeeId);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.locator(`a[href="/team/${learner.id}"]`).click();
  await expect(page.getByRole("heading", { name: learner.name, exact: true })).toBeVisible();
  await page.getByLabel("Course or path").selectOption(`course:${courseId}`);
  await page.getByLabel("Due in (days)").selectOption("7");
  await saveAndReload(page, page.getByRole("button", { name: "Assign training", exact: true }));
  await expect(page.getByRole("region", { name: "Current learning" })).toContainText(title);
  await page.getByLabel("Course or path").selectOption(`course:${courseId}`);
  await saveAndReload(page, page.getByRole("button", { name: "Assign training", exact: true }));
  await expect.poll(async () => withDb(async db => (await db.query("SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=$2", [learner.id, courseId])).rows[0].n)).toBe(1);
  await saveAndReload(page, page.getByRole("button", { name: "Send reminder now", exact: true }));
  await expect(page.getByRole("button", { name: "Nudged in the last 48h" })).toBeDisabled();
  await expectNoPageOverflow(page); await capture(page, info, "manager-member");

  await freshSignIn(page, learner);
  await page.getByRole("link", { name: "Continue lesson", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome and help the customer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect.poll(async () => withDb(async db => (await db.query("SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2", [learner.id, courseId])).rows[0].n)).toBe(1);
  await page.goto(`/course/${courseId}`);
  const certificate = page.getByRole("link", { name: /certificate/i });
  await expect(certificate).toBeVisible();
  const certUrl = await certificate.getAttribute("href");
  expect((await page.request.get(certUrl!)).ok()).toBe(true);
  await capture(page, info, "learner-earned-certificate");

  for (const [person, base] of [[manager, "/team/reports"], [admin, "/admin/reports"]] as const) {
    await freshSignIn(page, person); await page.goto(`${base}?report=transcript`);
    await page.getByLabel("Course title", { exact: true }).fill(title);
    await page.getByLabel("Employee ID", { exact: true }).fill(learner.employeeId);
    await page.getByRole("button", { name: "Apply filters" }).click();
    const table = page.getByRole("region", { name: "Learner transcript table", exact: true });
    await expect(table).toContainText(title); await expect(table).toContainText(learner.employeeId);
    const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
    const csv = await (await page.request.get(href!)).text();
    expect(csv).toContain(title); expect(csv).toContain(learner.employeeId); expect(csv.trim().split("\n")).toHaveLength(2);
    await page.reload(); await expect(page.getByLabel("Course title", { exact: true })).toHaveValue(title);
    await expectNoPageOverflow(page); await capture(page, info, `${person.role.toLowerCase()}-same-record-report`);
  }
});

test("@core Empty-manager reports, CSV and Ask Reports never include outside users", async ({ page }) => {
  const manager = await createPerson("MANAGER");
  await signIn(page, manager);
  for (const report of reports) {
    await page.goto(`/team/reports?report=${report}`);
    await expect(page.getByText("0 results · CSV uses these same filters")).toBeVisible();
    await expect(page.getByText("No rows match these filters.")).toBeVisible();
    const csv = await page.request.get(`/api/reports/${report}/csv`); expect(csv.ok()).toBe(true);
    expect((await csv.text()).trim().split("\n")).toHaveLength(1);
    await expectNoPageOverflow(page);
  }
  await page.getByRole("textbox", { name: "Ask reports" }).fill("Show inactive people");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("No matching rows", { exact: true })).toBeVisible();
  await page.getByText(/View interpreted report and filters/).click();
  await expect(page.locator("pre")).toContainText('"report": "engagement"');
});

test("@core @template Admin navigation, import, groups and rules are distinct persisted workflows", async ({ page }, info) => {
  test.setTimeout(120_000);
  const admin = await createPerson("ADMIN"); const manager = await createPerson("MANAGER"); const token = randomUUID().slice(0,8);
  await signIn(page, admin);
  await page.getByRole("link", { name: /Open HR tickets/ }).click();
  await expect(page.getByRole("heading", { name: "HR tickets", exact: true })).toBeVisible();
  await page.goto("/admin/people?view=groups");
  await page.getByLabel("New group", { exact: true }).fill(`QA group ${token}`);
  await saveAndReload(page, page.getByRole("button", { name: "Add", exact: true }));
  await expect(page.getByText(`QA group ${token}`, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "CSV import", exact: true }).click();
  const employeeId = `QAI${token.toUpperCase()}`;
  await page.getByLabel("Rows", { exact: true }).fill(`${employeeId},Imported ${token},LEARNER,,QA group ${token},Cashier,2026-09-01,${manager.employeeId}\nINVALID,Wrong,INVALID`);
  await page.getByRole("button", { name: "Import employees", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Row 2");
  await expect(page.getByLabel("Rows", { exact: true })).toHaveValue(new RegExp(employeeId));
  await expect(page.getByRole("region", { name: "One-time activation codes" })).toContainText(employeeId);
  expect(page.url()).not.toContain("codes=");
  await expect.poll(async () => withDb(async db => (await db.query("SELECT manager_id FROM users WHERE employee_id=$1", [employeeId])).rows[0]?.manager_id)).toBe(manager.id);
  await page.getByRole("link", { name: "People", exact: true }).last().click();
  await page.getByLabel("Search people").fill(employeeId); await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator("main details summary").click();
  await page.getByLabel("Time multiplier (assessment accommodation)").selectOption("1.5");
  await saveAndReload(page, page.getByRole("button", { name: "Save", exact: true }));
  await expect.poll(async () => withDb(async db => (await db.query("SELECT time_multiplier FROM users WHERE employee_id=$1", [employeeId])).rows[0].time_multiplier)).toBe(1.5);
  await page.getByRole("link", { name: "Enrollment rules", exact: true }).click();
  await page.getByLabel("Rule name").fill(`QA rule ${token}`);
  await page.getByLabel("Group (criteria)").selectOption({ label: `QA group ${token}` });
  await page.getByRole("button", { name: "Create & apply" }).click();
  const rule = page.locator("li").filter({ hasText: `QA rule ${token}` }); await expect(rule).toBeVisible();
  await expect.poll(async () => withDb(async db => (await db.query("SELECT count(*)::int n FROM enrollments e JOIN users u ON u.id=e.user_id WHERE u.employee_id=$1 AND e.source='rule'", [employeeId])).rows[0].n)).toBeGreaterThan(0);
  await saveAndReload(page, rule.getByRole("button", { name: "disable", exact: true }));
  await expect(rule.getByRole("button", { name: "enable", exact: true })).toBeVisible();
  await expectNoPageOverflow(page); await capture(page, info, "admin-enrollment-rules");
});

test("@core @template Human grade decisions, ticket replies and integrity outcomes persist", async ({ page }, info) => {
  test.setTimeout(120_000);
  const admin = await createPerson("ADMIN"), learner = await createPerson("LEARNER", { name: `QA review ${randomUUID().slice(0,6)}` });
  const bank = randomUUID(), question = randomUUID(), quiz = randomUUID(), attempt = randomUUID(), review = randomUUID(), ticket = randomUUID(), integrity = randomUUID();
  const ticketTitle = `QA HR request ${ticket.slice(0,8)}`;
  await withDb(async db => {
    await db.query("INSERT INTO question_banks (id,name) VALUES ($1,'QA human decision bank')", [bank]);
    await db.query("INSERT INTO questions (id,bank_id,type,status,points,body,rubric) VALUES ($1,$2,'free_text','APPROVED',2,$3,$4)", [question, bank, JSON.stringify({ prompt: "How would you help the customer?" }), JSON.stringify({ criteria: [{ name: "Helpful response", points: 2 }], modelAnswer: "Listen and find appropriate help." })]);
    const settings = { attemptsLimit: 3, cooldownMinutes: 0, gradingMethod: "highest", passPct: 50, shuffleQuestions: false, shuffleChoices: false, oneAtATime: false, noBacktrack: false, feedbackMode: "PRACTICE", graceSec: 0, integrityMode: true };
    await db.query("INSERT INTO quizzes (id,title,settings,sections) VALUES ($1,'QA human decision quiz',$2,'[]')", [quiz, JSON.stringify(settings)]);
    await db.query("INSERT INTO attempts (id,quiz_id,user_id,served_items,answers,score,max_score,grading_state,state,integrity_mode) VALUES ($1,$2,$3,$4,$5,0,2,'PROVISIONAL','GRADED',true)", [attempt, quiz, learner.id, JSON.stringify([{ questionId: question, type: "free_text" }]), JSON.stringify({ [question]: { kind: "text", text: "I would listen and ask a supervisor for support." } })]);
    await db.query("INSERT INTO grading_reviews (id,attempt_id,question_id,ai_scores,ai_rationale,ai_confidence,reason) VALUES ($1,$2,$3,$4,'Offline fixture requiring a human judgement.',0.3,'low_conf')", [review, attempt, question, JSON.stringify([{ criterion: "Helpful response", points: 0, max: 2 }])]);
    await db.query("INSERT INTO attempts (id,quiz_id,user_id,served_items,score,max_score,grading_state,state,integrity_mode) VALUES ($1,$2,$3,'[]',1,2,'FINAL','GRADED',true)", [integrity, quiz, learner.id]);
    await db.query("INSERT INTO integrity_events (id,attempt_id,kind,severity) VALUES ($1,$2,'focus_lost','orange')", [randomUUID(), integrity]);
    await db.query("INSERT INTO hr_conversations (id,user_id) VALUES ($1,$2)", [ticket, learner.id]);
    await db.query("INSERT INTO hr_tickets (id,conversation_id,user_id,subject,state) VALUES ($1,$1,$2,$3,'OPEN')", [ticket, learner.id, ticketTitle]);
    await db.query("INSERT INTO hr_ticket_messages (id,ticket_id,author_id,body) VALUES ($1,$2,$3,'The employee has shared this QA request for review.')", [randomUUID(), ticket, learner.id]);
  });
  await signIn(page, admin);
  await page.goto(`/admin/reviews?view=grades&item=${review}`);
  await expect(page.getByText("I would listen and ask a supervisor for support.", { exact: true })).toBeVisible();
  await page.getByLabel("Adjusted points (of 2)").fill("2");
  await saveAndReload(page, page.getByRole("button", { name: "Adjust & finalize", exact: true }));
  await expect.poll(async () => withDb(async db => (await db.query("SELECT state,reviewer_id FROM grading_reviews WHERE id=$1", [review])).rows[0])).toEqual({ state: "ADJUSTED", reviewer_id: admin.id });
  const grade = await withDb(async db => (await db.query("SELECT grading_state,passed,score FROM attempts WHERE id=$1", [attempt])).rows[0]);
  expect(grade).toEqual({ grading_state: "FINAL", passed: true, score: 2 });
  await page.goto("/admin/tickets"); await page.getByLabel("Search tickets").fill(ticketTitle); await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("link", { name: new RegExp(ticketTitle) }).click();
  await page.getByLabel("Reply to employee").fill("We have reviewed your request. Your manager can help arrange the next step.");
  await saveAndReload(page, page.getByRole("button", { name: "Reply", exact: true }));
  await expect(page.getByText("We have reviewed your request. Your manager can help arrange the next step.", { exact: true })).toBeVisible();
  await saveAndReload(page, page.getByRole("button", { name: "Mark resolved", exact: true }));
  await expect(page.getByRole("button", { name: "Mark resolved", exact: true })).toHaveCount(0);
  expect(await withDb(async db => (await db.query("SELECT state,assignee_id FROM hr_tickets WHERE id=$1", [ticket])).rows[0])).toEqual({ state: "RESOLVED", assignee_id: admin.id });
  await expectNoPageOverflow(page); await capture(page, info, "admin-resolved-ticket");
  await page.goto(`/admin/integrity/${integrity}`);
  await page.getByLabel("Void reason (required)").fill("Human review confirmed the second-person assistance in this QA fixture.");
  await saveAndReload(page, page.getByRole("button", { name: "Void — grant fresh attempt", exact: true }));
  await expect(page.getByText(/Voided: Human review confirmed/)).toBeVisible();
  expect(await withDb(async db => (await db.query("SELECT state FROM attempts WHERE id=$1", [integrity])).rows[0].state)).toBe("VOIDED");
  await expectNoPageOverflow(page); await capture(page, info, "admin-integrity-decision");
});

test("@core @template Type-specific authoring preserves all lesson types and the editor fits small screens", async ({ page }, info) => {
  test.setTimeout(150_000);
  const admin = await createPerson("ADMIN"); const course = randomUUID(), mod = randomUUID(), bank = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO courses(id,title) VALUES($1,'QA authoring coverage')", [course]);
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,'Authoring module')", [mod, course]);
    await db.query("INSERT INTO question_banks(id,name) VALUES($1,$2)", [bank, `QA bank ${bank.slice(0,8)}`]);
    await db.query("INSERT INTO questions(id,bank_id,type,status,body) VALUES($1,$2,'truefalse','APPROVED',$3)", [randomUUID(), bank, JSON.stringify({ prompt: "Keep walkways clear?", correct: [0] })]);
  });
  await signIn(page, admin); await page.goto(`/admin/courses/${course}`);
  for (const type of ["TEXT", "PDF", "VIDEO", "QUIZ", "INTERVIEW"]) {
    await page.getByText("Add lesson to Authoring module", { exact: true }).click();
    await page.getByLabel("Lesson type").selectOption(type);
    await page.getByLabel("Lesson title", { exact: true }).fill(`QA ${type} lesson`);
    await expect(page.getByLabel("Lesson content", { exact: true })).toBeVisible({ visible: type === "TEXT" });
    if (type === "TEXT") await page.getByLabel("Lesson content", { exact: true }).fill("# Read this\n\nKeep walkways clear.");
    if (type === "PDF") await page.getByLabel("PDF file URL").fill("/demo/food-safety-hygiene-card.pdf");
    if (type === "VIDEO") { await page.getByLabel("YouTube URL or video ID").fill(`QA${course.replaceAll("-", "").slice(0,9)}`); await page.getByLabel("Transcript (SRT or VTT)", { exact: true }).fill("1\n00:00:00,000 --> 00:00:10,000\nKeep walkways clear and report hazards to your supervisor."); }
    if (type === "QUIZ") { await page.getByLabel("Question bank").selectOption(bank); await page.getByLabel("Questions to draw").fill("1"); await page.getByLabel("Exam mode (feedback after submission)").check(); }
    if (type === "INTERVIEW") await page.getByLabel("Focus (optional)").fill("Safety routines");
    await expectNoPageOverflow(page); await capture(page, info, `editor-${type.toLowerCase()}`);
    await saveAndReload(page, page.getByRole("button", { name: "Add lesson", exact: true }));
    await expect(page.getByText(`QA ${type} lesson`, { exact: true })).toBeVisible();
  }
  const types = await withDb(async db => (await db.query("SELECT type FROM lessons WHERE module_id=$1 ORDER BY sort", [mod])).rows.map(r => r.type));
  expect(types).toEqual(["TEXT", "PDF", "VIDEO", "QUIZ", "INTERVIEW"]);
  await saveAndReload(page, page.getByRole("button", { name: "Move QA INTERVIEW lesson up", exact: true }));
  await expect.poll(async () => withDb(async db => (await db.query("SELECT type FROM lessons WHERE module_id=$1 ORDER BY sort", [mod])).rows.map(r => r.type))).toEqual(["TEXT", "PDF", "VIDEO", "INTERVIEW", "QUIZ"]);
  await page.getByText("Edit oral check settings", { exact: true }).click();
  const edit = page.locator("details").filter({ has: page.getByRole("button", { name: "Save oral check" }) });
  await edit.getByLabel("Focus (optional)").fill("Updated service focus"); await saveAndReload(page, edit.getByRole("button", { name: "Save oral check" }));
  await expect.poll(async () => withDb(async db => (await db.query("SELECT payload->'interview'->>'focus' focus FROM lessons WHERE module_id=$1 AND type='INTERVIEW'", [mod])).rows[0].focus)).toBe("Updated service focus");
  await page.getByText("Add lesson to Authoring module", { exact: true }).click();
  await page.getByLabel("Lesson type").selectOption("VIDEO");
  await page.getByLabel("Lesson title", { exact: true }).fill("QA reused video lesson");
  await page.getByLabel("YouTube URL or video ID").fill(`QA${course.replaceAll("-", "").slice(0,9)}`);
  await saveAndReload(page, page.getByRole("button", { name: "Add lesson", exact: true }));
  await expect(page.getByText("QA reused video lesson", { exact: true })).toBeVisible();
  const sharedVideos = await withDb(async db => (await db.query("SELECT payload->>'videoId' AS video_id FROM lessons WHERE module_id=$1 AND type='VIDEO'", [mod])).rows);
  expect(sharedVideos).toHaveLength(2); expect(sharedVideos[0].video_id).toBe(sharedVideos[1].video_id);
  await expectNoPageOverflow(page);
});

test("@core @template Policy publishing keeps previous versions and shows readable policy detail", async ({ page }, info) => {
  const admin = await createPerson("ADMIN"); const title = `QA policy ${randomUUID().slice(0,8)}`;
  await signIn(page, admin);
  for (const version of [1, 2]) {
    await page.goto("/admin/corpus?view=publish"); await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Policy owner").fill("QA HR owner"); await page.getByLabel("Effective date").fill("2026-09-01");
    await page.getByLabel("Document (markdown)", { exact: true }).fill(`# ${title}\n\n## Process\nVersion ${version}: Ask your supervisor to approve the requested leave.`);
    await page.getByRole("button", { name: "Publish & ingest", exact: true }).click();
    await expect(page).toHaveURL("/admin/corpus");
    const docs = await withDb(async db => (await db.query("SELECT version,status FROM policy_docs WHERE title=$1 ORDER BY version", [title])).rows);
    expect(docs).toHaveLength(version); expect(docs.at(-1)?.status).toBe("ACTIVE");
    if (version === 2) expect(docs[0].status).toBe("SUPERSEDED");
  }
  await page.getByRole("navigation", { name: "Policy versions" }).getByRole("link").filter({ hasText: title }).first().click();
  await expect(page.locator("article")).toContainText("Ask your supervisor");
  await expectNoPageOverflow(page); await capture(page, info, "admin-policy-detail");
  await page.getByRole("link", { name: "Assistant quality", exact: true }).click();
  await expect(page.getByRole("region", { name: "Assistant quality" })).toBeVisible(); await expectNoPageOverflow(page);
});

test("@core Manager path assignment fans out once and its learner inbox opens the actual path", async ({ page }, info) => {
  const manager = await createPerson("MANAGER"), learner = await createPerson("LEARNER", { managerId: manager.id });
  const path = randomUUID(), first = randomUUID(), second = randomUUID(), title = `QA path ${path.slice(0,8)}`;
  await withDb(async db => {
    await db.query("INSERT INTO courses(id,title,status) VALUES($1,'QA path first','PUBLISHED'),($2,'QA path second','PUBLISHED')", [first, second]);
    await db.query("INSERT INTO paths(id,title) VALUES($1,$2)", [path, title]);
    await db.query("INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,0),($4,$2,$5,1)", [randomUUID(), path, first, randomUUID(), second]);
  });
  await signIn(page, manager); await page.locator(`a[href="/team/${learner.id}"]`).click();
  await page.getByLabel("Course or path").selectOption(`path:${path}`);
  await saveAndReload(page, page.getByRole("button", { name: "Assign training", exact: true }));
  await expect(page.getByRole("region", { name: "Current learning" })).toContainText("QA path first");
  await page.getByLabel("Course or path").selectOption(`path:${path}`); await saveAndReload(page, page.getByRole("button", { name: "Assign training", exact: true }));
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND source_id=$2", [learner.id,path])).rows[0].n)).toBe(2);
  await freshSignIn(page, learner); await page.goto("/inbox");
  await expect(page.getByText(`You've been enrolled in “${title}”.`, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open update", exact: true }).click();
  await expect(page).toHaveURL(`/path/${path}`); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expectNoPageOverflow(page); await capture(page, info, "path-assignment-inbox");
});

test("@core @template All workspace destinations fit and workspace inboxes keep read states", async ({ page }, info) => {
  test.setTimeout(150_000);
  const admin = await createPerson("ADMIN"), manager = await createPerson("MANAGER");
  await withDb(async db => { for (const person of [admin,manager]) await db.query("INSERT INTO notifications(id,user_id,kind,payload) VALUES($1,$2,'manager_digest',$3)", [randomUUID(),person.id,JSON.stringify({ summary: "Review the latest team learning progress." })]); });
  await signIn(page,admin);
  for (const url of ["/admin", "/admin/courses", "/admin/people", "/admin/people?view=import", "/admin/people?view=groups", "/admin/people?view=rules", "/admin/reviews?view=grades", "/admin/reviews?view=drafts", "/admin/reviews?view=oral", "/admin/corpus", "/admin/corpus?view=publish", "/admin/corpus?view=quality", "/admin/tickets", "/admin/integrity", "/admin/reports", "/admin/inbox"]) {
    await page.goto(url); await expect(page.locator("main h1")).toHaveCount(1); await expectNoPageOverflow(page);
    if (["/admin", "/admin/reviews?view=grades", "/admin/reviews?view=drafts", "/admin/integrity"].includes(url)) await capture(page,info,`workspace-${url.split("/").at(-1)}`);
  }
  await saveAndReload(page, page.getByRole("button", { name: "Mark all as read" })); await expect(page.getByText("Read", { exact: true })).toBeVisible();
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL", [admin.id])).rows[0].n)).toBe(0);
  await freshSignIn(page,manager);
  for (const url of ["/team", "/team/reports", "/team/inbox"]) { await page.goto(url); await expectNoPageOverflow(page); }
  await saveAndReload(page, page.getByRole("button", { name: "Mark all as read" })); await expect(page.getByText("Read", { exact: true })).toBeVisible();
});

test("@core A reminder can be sent again after 48 hours and stays rate limited afterward", async ({ page }) => {
  const manager = await createPerson("MANAGER"), learner = await createPerson("LEARNER", { managerId: manager.id });
  await withDb(db => db.query("INSERT INTO notifications(id,user_id,kind,payload,dedupe_key,sent_at) VALUES($1,$2,'overdue','{}',$3,now()-interval '49 hours')", [randomUUID(),learner.id,`nudge:${learner.id}`]));
  await signIn(page,manager); await page.locator(`a[href="/team/${learner.id}"]`).click();
  await saveAndReload(page, page.getByRole("button", { name: "Send reminder now", exact: true }));
  await expect(page.getByRole("button", { name: "Nudged in the last 48h" })).toBeDisabled();
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND dedupe_key=$2", [learner.id,`nudge:${learner.id}`])).rows[0].n)).toBe(2);
});

test("@core Report API endpoints enforce MFA and privacy before returning data", async ({ page }) => {
  const unverified = await createPerson("ADMIN", { mfaSetup: true });
  // signIn stops at the setup gate because this prerequisite account has no seed.
  await signIn(page, unverified); await expect(page).toHaveURL(/\/login\/mfa-setup$/);
  expect((await page.request.get("/api/reports/engagement/csv")).status()).toBe(403);
  expect((await page.request.post("/api/reports/ask", { data: { question: "Show engagement" } })).status()).toBe(403);
  const manager = await createPerson("MANAGER", { privacy: 0 }); await freshSignIn(page,manager);
  await expect(page).toHaveURL(/\/privacy-notice$/);
  expect((await page.request.get("/api/reports/engagement/csv")).status()).toBe(403);
  expect((await page.request.post("/api/reports/ask", { data: { question: "Show engagement" } })).status()).toBe(403);
});

test("@core All seven question formats remain reviewable, with approval and discard recorded", async ({ page }, info) => {
  test.setTimeout(120_000);
  const admin = await createPerson("ADMIN"), bank = randomUUID();
  const types = ["mcq_single", "mcq_multi", "truefalse", "fill_blank", "matching", "ordering", "free_text"];
  const ids = types.map(() => randomUUID());
  await withDb(async db => {
    await db.query("INSERT INTO question_banks(id,name) VALUES($1,'QA seven-format review bank')", [bank]);
    for (let i = 0; i < types.length; i++) {
      await db.query("INSERT INTO questions(id,bank_id,type,status,body,rubric,created_by) VALUES($1,$2,$3,'DRAFT',$4,$5,'ai')", [ids[i],bank,types[i],JSON.stringify({ prompt: `QA ${types[i]} review ${bank.slice(0,8)}`, options: ["Safe", "Unsafe"], correct: [0], acceptedAnswers: ["safe"], pairs: [{ left: "Hazard", right: "Report" }], orderItems: ["Listen", "Help"], explanation: "Use the relevant source content." }), types[i] === "free_text" ? JSON.stringify({ criteria: [{ name: "Helpful", points: 1 }], modelAnswer: "Listen and help." }) : null]);
    }
  });
  await signIn(page,admin);
  for (let i = 0; i < types.length; i++) {
    await page.goto(`/admin/reviews?view=drafts&item=${ids[i]}`);
    await page.getByText("All question fields and marking criteria", { exact: true }).click();
    await expect(page.locator("pre")).toContainText(`QA ${types[i]} review`);
    if (types[i] === "free_text") await expect(page.locator("pre")).toContainText("Listen and help.");
    await expectNoPageOverflow(page);
    if (types[i] === "matching") await capture(page,info,"question-matching-review");
    await saveAndReload(page, page.getByRole("button", { name: i === 6 ? "Discard" : "Approve", exact: true }));
    expect(await withDb(async db => (await db.query("SELECT status FROM questions WHERE id=$1", [ids[i]])).rows[0].status)).toBe(i === 6 ? "RETIRED" : "APPROVED");
  }
});

test("@core Human oral-check review confirms a fail or overturns it to a persisted pass", async ({ page }, info) => {
  const admin = await createPerson("ADMIN"), learner = await createPerson("LEARNER");
  const course = randomUUID(), mod = randomUUID(), lesson = randomUUID(), fail = randomUUID(), overturn = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO courses(id,title,status) VALUES($1,'QA oral review course','PUBLISHED')", [course]);
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,'QA oral checks')", [mod,course]);
    await db.query("INSERT INTO lessons(id,module_id,type,title,payload) VALUES($1,$2,'INTERVIEW','QA reviewable oral check',$3)", [lesson,mod,JSON.stringify({ interview: { questionCount: 1, maxMinutes: 3, passPct: 67, requirePass: true, scope: "course" } })]);
    for (const id of [fail,overturn]) await db.query("INSERT INTO live_interviews(id,user_id,lesson_id,course_id,state,model,mock,outcome,score_pct,completed_at,transcript) VALUES($1,$2,$3,$4,'COMPLETED','offline-qa',true,'FAIL',33,now(),$5)", [id,learner.id,lesson,course,JSON.stringify([{ role: "user", text: "I would ask for help." }])]);
  });
  await signIn(page,admin);
  await page.goto(`/admin/reviews?view=oral&item=${fail}`);
  await page.getByText("Transcript (1 turns)", { exact: true }).click();
  await expect(page.getByText(/I would ask for help/)).toBeVisible();
  await saveAndReload(page,page.getByRole("button",{ name: "Confirm fail", exact: true }));
  const confirmed = await withDb(async db => (await db.query("SELECT outcome,reviewed_by FROM live_interviews WHERE id=$1", [fail])).rows[0]);
  expect(confirmed).toEqual({ outcome: "FAIL", reviewed_by: admin.id });
  await page.goto(`/admin/reviews?view=oral&item=${overturn}`);
  await saveAndReload(page,page.getByRole("button",{ name: "Overturn to pass", exact: true }));
  const passed = await withDb(async db => (await db.query("SELECT outcome,reviewed_by FROM live_interviews WHERE id=$1", [overturn])).rows[0]);
  expect(passed).toEqual({ outcome: "PASS", reviewed_by: admin.id });
  expect(await withDb(async db => (await db.query("SELECT status FROM lesson_progress WHERE lesson_id=$1 AND user_id=$2", [lesson,learner.id])).rows[0].status)).toBe("COMPLETED");
  await expectNoPageOverflow(page); await capture(page,info,"oral-review-completed");
});
