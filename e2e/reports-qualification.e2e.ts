import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, expectNoPageOverflow } from "./support";
import { textCourse, smallQuiz } from "./qualification-fixtures";
import { REPORTS } from "../lib/report-options";

function csvRows(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ""; }
    else if (char === '\n' && !quoted) { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/, "")]);
  return rows;
}

for (const role of ["MANAGER", "ADMIN"] as const) {
  test(`@core ${role} six report filters and actual downloaded CSV agree with persisted learner results`, async ({ page }, info) => {
    test.setTimeout(150_000);
    const manager = await createPerson("MANAGER"), actor = role === "MANAGER" ? manager : await createPerson("ADMIN");
    const learner = await createPerson("LEARNER", { managerId: manager.id, name: 'QA report, "quoted" learner' });
    const outsider = await createPerson("LEARNER"), f = await textCourse(learner.id, { certificate: true });
    const q = await smallQuiz(), quizLesson = randomUUID(), store = `QAStore${randomUUID().slice(0, 8)}`, storeId = randomUUID();
    await withDb(async db => {
      await db.query("INSERT INTO org_units(id,type,name) VALUES($1,'store',$2)", [storeId, store]);
      await db.query("UPDATE users SET store_id=$2 WHERE id=ANY($1)", [[learner.id, outsider.id], storeId]);
      await db.query("UPDATE courses SET certificate_validity_days=40 WHERE id=$1", [f.course]);
      await db.query("INSERT INTO lessons(id,module_id,type,title,sort,payload) VALUES($1,$2,'QUIZ','Report assessment',1,$3)", [quizLesson, f.module, JSON.stringify({ quizId: q.quiz })]);
      await db.query("UPDATE quizzes SET lesson_id=$2 WHERE id=$1", [q.quiz, quizLesson]);
    });
    await signIn(page, learner); await page.goto(`/lesson/${f.lesson}`);
    await page.getByRole("button", { name: "Mark complete", exact: true }).click();
    await expect(page.getByText("Lesson complete", { exact: true })).toBeVisible();
    await page.goto(`/quiz/${q.quiz}`); await page.getByRole("button", { name: "Start assessment", exact: true }).click();
    await page.getByRole("radio", { name: "Wash hands", exact: true }).check();
    await page.getByRole("textbox", { name: "Type the safety word", exact: true }).fill("safe");
    await page.getByRole("button", { name: "Submit assessment", exact: true }).click();
    await expect(page.getByText("Final result: passed", { exact: true })).toBeVisible();
    expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2", [learner.id, f.course])).rows[0].n)).toBe(1);
    await page.context().clearCookies(); await signIn(page, actor);
    const base = role === "MANAGER" ? "/team/reports" : "/admin/reports";
    await page.goto(base);
    for (const report of REPORTS) {
      await page.getByRole("link", { name: report.label, exact: true }).click();
      if (report.id !== "engagement") await page.getByLabel("Course title", { exact: true }).fill(f.title);
      await page.getByLabel("Store name", { exact: true }).fill(store);
      await page.getByLabel("Employee ID", { exact: true }).fill(learner.employeeId);
      if (["completion", "compliance"].includes(report.id)) await page.getByLabel("Compliance status", { exact: true }).selectOption("COMPLETED");
      if (["cert_expiry", "engagement"].includes(report.id)) await page.getByRole("spinbutton").fill("45");
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await page.waitForURL(url => url.searchParams.get("report") === report.id && url.searchParams.get("employee") === learner.employeeId);
      await expect(page.getByText("1 result · CSV uses these same filters", { exact: true })).toBeVisible();
      const table = page.getByRole("region", { name: "Report results", exact: true }).locator("table");
      const visible = await table.locator("tr").evaluateAll(rows => rows.map(row => Array.from(row.querySelectorAll("th,td"), cell => cell.textContent!.trim())));
      const download = page.waitForEvent("download"); await page.getByRole("link", { name: "Export CSV", exact: true }).click();
      const file = await download, csv = readFileSync((await file.path())!, "utf8").replace(/^\uFEFF/, "");
      expect(csvRows(csv)).toEqual(visible);
      await info.attach(`${role}-${report.id}.csv`, { body: csv, contentType: "text/csv" });
      await page.reload(); await expect(page.getByLabel("Employee ID", { exact: true })).toHaveValue(learner.employeeId);
      await expectNoPageOverflow(page);
      await page.getByLabel("Store name", { exact: true }).fill(`Missing${randomUUID()}`);
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(page.getByText("No rows match these filters.", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Reset filters", exact: true }).click();
      await expect(page.getByLabel("Employee ID", { exact: true })).toHaveValue("");
      expect(new URL(page.url()).search).toBe(`?report=${report.id}`);
    }
    // Failure/recovery runs through the intended Ask control. No success body is mocked.
    await page.route("**/api/reports/ask", route => route.abort("failed"));
    const question = `Show engagement for store ${store} in the last 45 days`;
    await page.getByRole("textbox", { name: "Ask reports", exact: true }).fill(question);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "connection was interrupted" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Ask reports", exact: true })).toHaveValue(question);
    await page.unroute("**/api/reports/ask"); await page.getByRole("button", { name: "Ask", exact: true }).click();
    const interpreted = page.getByRole("region", { name: "Ask Reports table", exact: true });
    await expect(interpreted).toContainText(learner.employeeId);
    if (role === "MANAGER") await expect(interpreted).not.toContainText(outsider.employeeId);
    else await expect(interpreted).toContainText(outsider.employeeId);
    await page.getByText(/View interpreted report and filters/).click();
    await expect(page.locator("pre")).toContainText('"report": "engagement"');
    await expect(page.locator("pre")).toContainText('"daysWindow": 45');
    await info.attach("report-prerequisites", { body: JSON.stringify({ role, actor: actor.id, learner: learner.id, outsider: outsider.id, course: f.course, quiz: q.quiz }), contentType: "application/json" });
  });
}
