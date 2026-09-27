import { randomUUID } from "node:crypto";
import { test, expect, type Page, type Locator, type TestInfo } from "@playwright/test";
import { createPerson, signIn, withDb, expectNoPageOverflow, capture as captureBase } from "./support";

async function capture(page: Page, info: TestInfo, label: string) { await page.evaluate(() => window.scrollTo(0, 0)); await captureBase(page, info, label); }
async function saveAndReload(page: Page, button: Locator) { await Promise.all([page.waitForEvent("load"), button.click()]); }
// Rule creation/toggling reevaluates the full preserved QA population.
async function saveBulkRuleAndReload(page: Page, button: Locator, info: TestInfo, label: string) {
  const dataset = await withDb(async db => (await db.query("SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM enrollment_rules) rules")).rows[0]);
  const started = Date.now();
  const [, response] = await Promise.all([
    page.waitForEvent("load", { timeout: 60_000 }),
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/admin/people", { timeout: 60_000 }),
    button.click(),
  ]);
  expect(response.status()).toBe(200);
  await info.attach(`bulk-rule-${label}`, { body: JSON.stringify({ dataset, started: new Date(started).toISOString(), finished: new Date().toISOString(), durationMs: Date.now() - started, responseStatus: response.status() }), contentType: "application/json" });
}
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
  await expect(page.getByText("Lesson complete", { exact: true })).toBeVisible();
  await expect.poll(async () => withDb(async db => (await db.query("SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2", [learner.id, courseId])).rows[0].n)).toBe(1);
  await page.getByRole("link", { name: "Course overview", exact: true }).click();
  await expect(page).toHaveURL(`/course/${courseId}`);
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
    await page.waitForURL(url => url.pathname === base && url.searchParams.get("course") === title && url.searchParams.get("employee") === learner.employeeId);
    const table = page.getByRole("region", { name: "Learner transcript table", exact: true });
    await expect(table).toContainText(title); await expect(table).toContainText(learner.employeeId);
    const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
    const csv = await (await page.request.get(href!)).text();
    expect(csv).toContain(title); expect(csv).toContain(learner.employeeId); expect(csv.trim().split("\n")).toHaveLength(2);
    await page.reload(); await expect(page.getByLabel("Course title", { exact: true })).toHaveValue(title);
    await expect(table).toContainText(learner.employeeId);
    await expectNoPageOverflow(page); await capture(page, info, `${person.role.toLowerCase()}-same-record-report`);
  }
  await page.goto(`/admin/courses/${courseId}?view=settings`);
  await saveAndReload(page, page.getByRole("button", { name: "Unpublish", exact: true }));
  await freshSignIn(page, learner); await page.goto(`/course/${courseId}`);
  await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
  await page.goto(`/learn?view=browse&q=${encodeURIComponent(title)}`);
  await expect(page.locator(`a[href='/course/${courseId}']`)).toHaveCount(0);
  await freshSignIn(page, admin); await page.goto(`/admin/courses/${courseId}?view=settings`);
  await saveAndReload(page, page.getByRole("button", { name: "Publish", exact: true }));
  await freshSignIn(page, learner); await page.goto(`/course/${courseId}`);
  await expect(page.getByRole("link", { name: /certificate/i })).toBeVisible();
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2", [learner.id, courseId])).rows[0].n)).toBe(1);
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
  // Three independently capped 60s bulk actions plus 60s for the retained
  // import/editor/persistence chain. Individual limits and assertions stay fixed.
  test.setTimeout(240_000);
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
  await page.getByRole("button", { name: "Import employees", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("already exists; skipped");
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM users WHERE employee_id=$1", [employeeId])).rows[0].n)).toBe(1);
  const peopleStarted = Date.now();
  const [peopleResponse] = await Promise.all([
    page.waitForResponse(r => r.request().isNavigationRequest() && new URL(r.url()).searchParams.get("view") === "people"),
    page.waitForEvent("load", { timeout: 30_000 }),
    page.getByRole("link", { name: "People", exact: true }).last().click(),
  ]);
  expect(peopleResponse.status()).toBe(200);
  const choiceCounts = await withDb(async db => (await db.query("SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM users WHERE role!='LEARNER') managers,(SELECT count(*)::int FROM groups) groups,(SELECT count(*)::int FROM org_units WHERE type='store') stores")).rows[0]);
  await expect(page.getByLabel("Search people",{exact:true})).toBeVisible();
  await expect(page.locator("main details summary")).toHaveCount(Math.min(25,choiceCounts.users));
  await info.attach("people-document", { body: JSON.stringify({ dataset: choiceCounts, bytes: (await peopleResponse.body()).length, loadMs: Date.now()-peopleStarted, closedSelects: await page.locator("main details select").count(), closedOptions: await page.locator("main details option").count() }), contentType: "application/json" });
  await expect(page.locator("main details select")).toHaveCount(0);
  const expectedChoices=await withDb(async db => (await db.query("SELECT ARRAY(SELECT id::text FROM users WHERE role!='LEARNER') managers,ARRAY(SELECT id::text FROM groups) groups,ARRAY(SELECT id::text FROM org_units WHERE type='store') stores")).rows[0]);
  await page.getByLabel("Search people").fill(employeeId);
  await Promise.all([page.waitForEvent("load", { timeout: 30_000 }), page.getByRole("button", { name: "Search", exact: true }).click()]);
  const personSummary = page.locator("main details summary");
  await personSummary.focus(); await page.keyboard.press("Enter");
  await expect(page.getByLabel("Manager", { exact: true })).toHaveValue(manager.id);
  // Another isolated worker may add a choice after this snapshot; every choice
  // available before navigation must remain available to this editor.
  for(const [label,ids] of [["Manager",expectedChoices.managers],["Group",expectedChoices.groups],["Store",expectedChoices.stores]] as const){
    const values=await page.getByLabel(label,{exact:true}).locator("option").evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value));
    expect(values).toEqual(expect.arrayContaining(["",...ids]));
  }
  await page.getByLabel("Time multiplier (assessment accommodation)").selectOption("1.5");
  await personSummary.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("main details select")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Time multiplier (assessment accommodation)")).toHaveValue("1.5");
  let releaseSave: () => void = () => {}; const heldSave = new Promise<void>(resolve => { releaseSave = resolve; }); let saveRequests = 0;
  const personUrl = page.url();
  await page.route(personUrl, async route => {
    if(route.request().method()!=="POST"){await route.continue();return;}
    saveRequests++;const response=await route.fetch();await heldSave;await route.fulfill({response});
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savedLoad=page.waitForEvent("load", {timeout:30_000});
  try {
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await personSummary.click();await personSummary.click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Time multiplier (assessment accommodation)")).toHaveValue("1.5");
  } finally {releaseSave();}
  await savedLoad;await page.unroute(personUrl);expect(saveRequests).toBe(1);
  await expect.poll(async () => withDb(async db => (await db.query("SELECT time_multiplier FROM users WHERE employee_id=$1", [employeeId])).rows[0].time_multiplier)).toBe(1.5);
  await page.getByRole("link", { name: "Enrollment rules", exact: true }).click();
  await page.getByLabel("Rule name").fill(`QA rule ${token}`);
  await page.getByLabel("Group (criteria)").selectOption({ label: `QA group ${token}` });
  await saveBulkRuleAndReload(page, page.getByRole("button", { name: "Create & apply" }), info, "create");
  const rule = page.locator("li").filter({ hasText: `QA rule ${token}` }); await expect(rule).toBeVisible();
  await expect.poll(async () => withDb(async db => (await db.query("SELECT count(*)::int n FROM enrollments e JOIN users u ON u.id=e.user_id WHERE u.employee_id=$1 AND e.source='rule'", [employeeId])).rows[0].n)).toBeGreaterThan(0);
  await saveBulkRuleAndReload(page, rule.getByRole("button", { name: "disable", exact: true }), info, "disable");
  await expect(rule.getByRole("button", { name: "enable", exact: true })).toBeVisible();
  await saveBulkRuleAndReload(page, rule.getByRole("button", { name: "enable", exact: true }), info, "enable");
  await expect(rule.getByRole("button", { name: "disable", exact: true })).toBeVisible();
  const activeCount = () => withDb(async db => (await db.query("SELECT count(*)::int n FROM enrollments e JOIN users u ON u.id=e.user_id WHERE u.employee_id=$1 AND e.source='rule' AND e.status IN ('NOT_STARTED','IN_PROGRESS')", [employeeId])).rows[0].n);
  expect(await activeCount()).toBe(1);
  await page.goto(`/admin/people?q=${employeeId}`); await page.locator("main details summary").click();
  await page.getByLabel("Group", { exact: true }).selectOption("");
  await saveAndReload(page, page.getByRole("button", { name: "Save", exact: true }));
  expect(await activeCount()).toBe(0);
  await page.locator("main details summary").click(); await page.getByLabel("Group", { exact: true }).selectOption({ label: `QA group ${token}` });
  await saveAndReload(page, page.getByRole("button", { name: "Save", exact: true }));
  expect(await activeCount()).toBe(1);
  await page.locator("main details summary").click();
  await page.getByRole("button", { name: "Issue reset/activation code", exact: true }).click();
  await expect(page.getByRole("region", { name: "Issued reset code", exact: true })).toBeVisible();
  const issuedCode=await page.getByRole("region", { name: "Issued reset code", exact: true }).innerText();
  await page.locator("main details summary").click();await page.locator("main details summary").click();
  await expect(page.getByRole("region", { name: "Issued reset code", exact: true })).toHaveText(issuedCode, { useInnerText: true });
  await page.getByRole("button", { name: "Hide code", exact: true }).click();
  await expect(page.getByRole("region", { name: "Issued reset code", exact: true })).toHaveCount(0);
  await expectNoPageOverflow(page); await capture(page, info, "admin-enrollment-rules");
});

test("@core @template Human grade decisions, ticket replies and integrity outcomes persist", async ({ page }, info) => {
  test.setTimeout(120_000);
  const admin = await createPerson("ADMIN"), learner = await createPerson("LEARNER", { name: `QA review ${randomUUID().slice(0,6)}` });
  const bank = randomUUID(), question = randomUUID(), quiz = randomUUID(), attempt = randomUUID(), review = randomUUID(), ticket = randomUUID(), integrity = randomUUID();
  const ticketTitle = `QA HR request ${ticket.slice(0,8)}`;
  const scenario = "A customer reports a damaged package and asks for a replacement. The item is out of stock at your store.";
  await withDb(async db => {
    await db.query("INSERT INTO question_banks (id,name) VALUES ($1,'QA human decision bank')", [bank]);
    await db.query("INSERT INTO questions (id,bank_id,type,status,points,body,rubric) VALUES ($1,$2,'free_text','APPROVED',2,$3,$4)", [question, bank, JSON.stringify({ prompt: "How would you help the customer?", stimulus: scenario }), JSON.stringify({ criteria: [{ name: "Helpful response", points: 2 }], modelAnswer: "Listen and find appropriate help." })]);
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
  const context = page.getByRole("region", { name: "Question scenario", exact: true });
  await expect(context).toContainText(scenario);
  await expect(context.getByRole("heading", { name: "Scenario", exact: true })).toBeVisible();
  const learnerAnswer = page.getByText("I would listen and ask a supervisor for support.", { exact: true });
  await expect(learnerAnswer).toBeVisible();
  const scenarioBox = await context.boundingBox(), answerBox = await learnerAnswer.boundingBox();
  expect(scenarioBox!.y + scenarioBox!.height).toBeLessThanOrEqual(answerBox!.y);
  await expectNoPageOverflow(page); await capture(page, info, "human-grade-scenario");
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
  await page.getByText("Add lesson to Authoring module", { exact: true }).click();
  await page.getByLabel("Lesson title", { exact: true }).fill("QA type-switch validation");
  await page.getByLabel("Lesson type").selectOption("QUIZ");
  await page.getByLabel("Question bank").selectOption(bank);
  await page.getByLabel("Questions to draw").fill("101");
  await page.getByRole("button", { name: "Add lesson", exact: true }).click();
  expect(await page.getByLabel("Questions to draw").evaluate(el => (el as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM lessons WHERE module_id=$1", [mod])).rows[0].n)).toBe(0);
  await page.getByLabel("Lesson type").selectOption("INTERVIEW");
  await page.getByLabel("Questions (1–6)", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Add lesson", exact: true }).click();
  expect(await page.getByLabel("Questions (1–6)", { exact: true }).evaluate(el => (el as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM lessons WHERE module_id=$1", [mod])).rows[0].n)).toBe(0);
  await page.getByLabel("Lesson type").selectOption("QUIZ");
  await expect(page.getByLabel("Questions to draw")).toHaveValue("101");
  await page.getByLabel("Lesson type").selectOption("INTERVIEW");
  await expect(page.getByLabel("Questions (1–6)", { exact: true })).toHaveValue("7");
  await page.getByLabel("Lesson type").selectOption("TEXT");
  await expect(page.getByLabel("Questions to draw")).toBeDisabled();
  await expect(page.getByLabel("Questions (1–6)", { exact: true })).toBeDisabled();
  for (const type of ["TEXT", "PDF", "VIDEO", "QUIZ", "INTERVIEW"]) {
    if (type !== "TEXT") await page.getByText("Add lesson to Authoring module", { exact: true }).click();
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
  const policy = page.getByRole("navigation", { name: "Policy versions" }).getByRole("link").filter({ hasText: title }).first();
  const destination = await policy.getAttribute("href");
  expect(destination).toBeTruthy();
  await policy.click();
  await expect(page).toHaveURL(destination!);
  // Streamed HTML can contain the correct text in hidden S:0 while the visible
  // document is still the short loading shell. Qualify the revealed article.
  await expect(page.locator("article")).toBeVisible();
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

test("@core @template All seven question formats remain reviewable, with approval and discard recorded", async ({ page }, info) => {
  test.setTimeout(120_000);
  const admin = await createPerson("ADMIN"), bank = randomUUID();
  const types = ["mcq_single", "mcq_multi", "truefalse", "fill_blank", "matching", "ordering", "free_text"];
  const ids = types.map(() => randomUUID());
  const bodies = [
    { options: ["Report the spill", "Walk past it"], correct: [0] },
    { options: ["Wear gloves", "Wash hands", "Ignore the hazard"], correct: [0, 1] },
    { correct: [1] },
    { acceptedAnswers: ["supervisor", "manager"] },
    { pairs: [{ left: "Wet floor", right: "Use a warning sign" }, { left: "Damaged tool", right: "Remove it from use" }] },
    { orderItems: ["Listen to the request", "Clarify the need", "Offer suitable help"] },
    { stimulus: "A customer is unsure which product meets their needs." },
  ];
  await withDb(async db => {
    await db.query("INSERT INTO question_banks(id,name) VALUES($1,'QA seven-format review bank')", [bank]);
    for (let i = 0; i < types.length; i++) {
      await db.query("INSERT INTO questions(id,bank_id,type,status,body,rubric,created_by) VALUES($1,$2,$3,'DRAFT',$4,$5,'ai')", [ids[i],bank,types[i],JSON.stringify({ prompt: `QA ${types[i]} review ${bank.slice(0,8)}`, ...bodies[i], explanation: "Use the relevant source content." }), types[i] === "free_text" ? JSON.stringify({ criteria: [{ name: "Clarifies the customer need", points: 2 }, { name: "Offers suitable help", points: 3 }], modelAnswer: "Listen, clarify the need and offer suitable help." }) : null]);
    }
  });
  await signIn(page,admin);
  for (let i = 0; i < types.length; i++) {
    await page.goto(`/admin/reviews?view=drafts&item=${ids[i]}`);
    const guide = page.getByRole("region", { name: "Question answer guide", exact: true });
    await expect(guide).toBeVisible();
    if (page.viewportSize()!.width < 1200) await expect(guide).toBeInViewport();
    if (types[i] === "mcq_single") { await expect(guide.getByRole("listitem").filter({ hasText: "Report the spill" })).toContainText("Correct answer"); await expect(guide).toContainText("Walk past it"); }
    if (types[i] === "mcq_multi") { for (const answer of ["Wear gloves", "Wash hands"]) await expect(guide.getByRole("listitem").filter({ hasText: answer })).toContainText("Correct answer"); }
    if (types[i] === "truefalse") await expect(guide.getByText("False", { exact: true })).toBeVisible();
    if (types[i] === "fill_blank") { await expect(guide.getByRole("list", { name: "Accepted answers" })).toContainText("supervisor"); await expect(guide).toContainText("manager"); }
    if (types[i] === "matching") { const pairs = guide.getByRole("list", { name: "Correct pairs" }); await expect(pairs.getByRole("listitem").nth(0)).toHaveText("Wet floor → Use a warning sign"); await expect(pairs.getByRole("listitem").nth(1)).toHaveText("Damaged tool → Remove it from use"); }
    if (types[i] === "ordering") await expect(guide.getByRole("list", { name: "Correct order" }).getByRole("listitem")).toHaveText(["Listen to the request", "Clarify the need", "Offer suitable help"]);
    if (types[i] === "free_text") { await expect(guide).toContainText("Clarifies the customer need · 2 points"); await expect(guide).toContainText("Offers suitable help · 3 points"); await expect(guide).toContainText("Listen, clarify the need and offer suitable help."); await expect(guide).toContainText("A customer is unsure which product meets their needs."); }
    await expectNoPageOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await info.attach(`question-${types[i]}-review`, { body: await page.screenshot({ fullPage: false, animations: "disabled" }), contentType: "image/png" });
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

test("@core @template Failed video ingestion recovers with a replacement transcript and can retry the saved transcript", async ({ page }, info) => {
  const admin = await createPerson("ADMIN"); const course = randomUUID(), mod = randomUUID();
  await withDb(async db => {
    await db.query("INSERT INTO courses(id,title) VALUES($1,'QA video recovery')", [course]);
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,'Recovery module')", [mod, course]);
  });
  await signIn(page, admin); await page.goto(`/admin/courses/${course}`);
  await page.getByText("Add lesson to Recovery module", { exact: true }).click();
  await page.getByLabel("Lesson type").selectOption("VIDEO");
  await page.getByLabel("Lesson title", { exact: true }).fill("QA failed video");
  await page.getByLabel("YouTube URL or video ID").fill(`QA${course.replaceAll("-", "").slice(0,9)}`);
  await page.getByLabel("Transcript (SRT or VTT)", { exact: true }).fill("An invalid transcript with no timestamps");
  await saveAndReload(page, page.getByRole("button", { name: "Add lesson", exact: true }));
  await expect(page.getByText("Video failed", { exact: true })).toBeVisible();
  const videoId = await withDb(async db => (await db.query("SELECT payload->>'videoId' id FROM lessons WHERE module_id=$1", [mod])).rows[0].id);
  await page.getByText("Retry video ingestion", { exact: true }).click();
  await page.getByLabel("Replacement transcript (SRT or VTT)").fill("Still invalid");
  await page.getByRole("button", { name: "Retry ingestion", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("SRT or VTT");
  await expect(page.getByLabel("Replacement transcript (SRT or VTT)")).toHaveValue("Still invalid");
  await page.getByLabel("Replacement transcript (SRT or VTT)").fill("1\n00:00:00,000 --> 00:00:10,000\nKeep walkways clear and report hazards to your supervisor.");
  await expectNoPageOverflow(page); await capture(page, info, "admin-video-recovery");
  await saveAndReload(page, page.getByRole("button", { name: "Retry ingestion", exact: true }));
  await expect(page.getByText("Video ready", { exact: true })).toBeVisible();
  expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM video_chunks WHERE video_id=$1", [videoId])).rows[0].n)).toBeGreaterThan(0);
  // A later service outage must reuse the saved transcript instead of losing it on retry.
  await withDb(async db => db.query("UPDATE videos SET ingestion_status='FAILED',failure_reason='QA transient embedding outage' WHERE id=$1", [videoId]));
  await page.reload(); await page.getByText("Retry video ingestion", { exact: true }).click();
  await saveAndReload(page, page.getByRole("button", { name: "Retry ingestion", exact: true }));
  await expect(page.getByText("Video ready", { exact: true })).toBeVisible();
  expect(await withDb(async db => (await db.query("SELECT ingestion_status,failure_reason FROM videos WHERE id=$1", [videoId])).rows[0])).toEqual({ ingestion_status: "READY", failure_reason: null });
});

test("@core Workspace mutation forms cannot submit before client handlers are ready", async ({ page, browser }, info) => {
  const admin = await createPerson("ADMIN"), learner = await createPerson("LEARNER"); await signIn(page, admin);
  const unhydrated = await browser.newContext({ storageState: await page.context().storageState(), ignoreHTTPSErrors: info.project.use.ignoreHTTPSErrors });
  try {
    // Allow inline streaming reveal scripts while withholding the application handlers.
    await unhydrated.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, route => route.abort());
    const initial = await unhydrated.newPage();
    await initial.goto(new URL("/admin/courses", page.url()).href);
    await expect(initial.getByRole("button", { name: "Create draft", exact: true })).toBeDisabled();
    await expect(initial.getByRole("region", { name: "New course", exact: true }).locator("form")).toHaveAttribute("method", "post");
    await expect(initial.getByRole("status").filter({ hasText: "Preparing form" })).toBeVisible();
    await initial.goto(new URL(`/team/${learner.id}`, page.url()).href);
    await expect(initial.getByRole("button", { name: "Issue password reset code", exact: true })).toBeDisabled();
    await expect(initial.getByRole("status").filter({ hasText: "Preparing account help" })).toBeVisible();
  } finally { await unhydrated.close(); }
  const delayed = await browser.newContext({ storageState: await page.context().storageState(), ignoreHTTPSErrors: info.project.use.ignoreHTTPSErrors });
  let releaseScripts: () => void = () => {}; const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  try {
    await delayed.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async route => { await scriptsReady; await route.continue(); });
    const early = await delayed.newPage(); const pageErrors: string[] = []; early.on("pageerror", error => pageErrors.push(error.message));
    await early.goto(new URL(`/admin/people?q=${learner.employeeId}`, page.url()).href, { waitUntil: "commit" });
    await early.locator("main details summary").click();
    await expect(early.locator("main details")).toHaveAttribute("open", "");
    await expect(early.locator("main details select")).toHaveCount(0);
    releaseScripts();
    await expect(early.getByLabel("Time multiplier (assessment accommodation)")).toBeEnabled();
    await expect(early.getByLabel("Role", { exact: true })).toHaveValue("LEARNER");
    expect(pageErrors).toEqual([]);
  } finally { releaseScripts(); await delayed.close(); }
  await page.goto("/admin/courses");
  await expect(page.getByRole("button", { name: "Create draft", exact: true })).toBeEnabled();
  await page.goto(`/team/${learner.id}`);
  await page.getByRole("button", { name: "Issue password reset code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reset code issued", exact: true })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});
