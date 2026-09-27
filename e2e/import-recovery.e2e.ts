import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb, QA_PASSWORD } from "./support";

test("@core Overlapping enrollment rules and a failed CSV row retain usable codes and allow immediate recovery", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const admin = await createPerson("ADMIN"), token = randomUUID().replaceAll("-", "").slice(0, 10), group = randomUUID(), course = randomUUID(), path = randomUUID();
  const earlier = `QAE${token}`, failed = `QAF${token}`, overlap = `QAO${token}`, retry = `QAN${token}`;
  const trigger = `qa_import_${token}`;
  await withDb(async db => {
    await db.query("INSERT INTO groups(id,name) VALUES($1,$2)", [group, `QA overlap ${token}`]);
    await db.query("INSERT INTO courses(id,title,status) VALUES($1,'QA overlap course','PUBLISHED')", [course]);
    await db.query("INSERT INTO paths(id,title) VALUES($1,'QA overlap path')", [path]);
    await db.query("INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,0)", [randomUUID(), path, course]);
    for (const [type, target] of [["course", course], ["path", path]]) await db.query("INSERT INTO enrollment_rules(id,name,criteria,target_type,target_id,active) VALUES($1,$2,$3,$4,$5,true)", [randomUUID(), `QA overlap ${type} ${token}`, JSON.stringify({ groupId: group }), type, target]);
    // Scoped database fault proves per-row rollback without affecting any other learner/course.
    await db.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.course_id = '${course}' AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND employee_id='${failed.toUpperCase()}') THEN RAISE EXCEPTION 'QA isolated import row failure'; END IF; RETURN NEW; END $$`);
    await db.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON enrollments FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
  });
  let removed = false;
  const removeFault = async () => { if (!removed) { await withDb(async db => { await db.query(`DROP TRIGGER IF EXISTS ${trigger} ON enrollments`); await db.query(`DROP FUNCTION IF EXISTS ${trigger}()`); }); removed = true; } };
  try {
    await signIn(page, admin); await page.goto("/admin/people?view=import");
    const rows = `${earlier},Earlier employee,LEARNER\n${failed},Retry employee,LEARNER,,QA overlap ${token}\n${overlap},Overlap employee,LEARNER,,QA overlap ${token}`;
    await page.getByLabel("Rows", { exact: true }).fill(rows);
    let release = () => {}; const held = new Promise<void>(resolve => { release = resolve; }); let writes = 0;
    await page.route("**/admin/people?view=import", async route => { if (route.request().method() !== "POST") { await route.continue(); return; } writes++; const response = await route.fetch(); await held; await route.fulfill({ response }); });
    const submit = page.getByRole("button", { name: "Import employees", exact: true });
    await submit.click(); await expect(submit).toBeDisabled();
    await submit.evaluate(button => (button as HTMLButtonElement).form!.requestSubmit());
    await expect.poll(() => writes).toBe(1); release();
    const codes = page.getByRole("region", { name: "One-time activation codes", exact: true });
    await expect(codes).toContainText(earlier.toUpperCase()); await expect(codes).toContainText(overlap.toUpperCase()); await expect(codes).not.toContainText(failed.toUpperCase());
    await expect(page.getByRole("alert").filter({ hasText: "could not be imported" })).toBeVisible(); await expect(submit).toBeEnabled();
    const displayed = await codes.locator("pre").innerText();
    const codeFor = (employee: string) => displayed.split("\n").find(line => line.startsWith(`${employee.toUpperCase()}:`))!.split(": ")[1];
    expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM users WHERE employee_id=$1", [failed.toUpperCase()])).rows[0].n)).toBe(0);
    expect(await withDb(async db => (await db.query("SELECT count(*)::int n FROM enrollments e JOIN users u ON u.id=e.user_id WHERE u.employee_id=$1 AND e.course_id=$2 AND e.status IN ('NOT_STARTED','IN_PROGRESS')", [overlap.toUpperCase(), course])).rows[0].n)).toBe(1);
    await page.unroute("**/admin/people?view=import"); await removeFault();
    await page.getByLabel("Rows", { exact: true }).fill(`${failed},Retry employee,LEARNER,,QA overlap ${token}`); await submit.click();
    await expect(codes).toContainText(failed.toUpperCase()); await expect(submit).toBeEnabled();
    // A transport failure must release the same shared form and retain its entries.
    await page.getByLabel("Rows", { exact: true }).fill(`${retry},Network retry employee,LEARNER`);
    await page.route("**/admin/people?view=import", route => route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue());
    await submit.click(); await expect(page.getByRole("alert").filter({ hasText: "Your changes could not be saved" })).toBeVisible(); await expect(submit).toBeEnabled();
    await expect(page.getByLabel("Rows", { exact: true })).toHaveValue(new RegExp(retry));
    await page.unroute("**/admin/people?view=import"); await submit.click(); await expect(codes).toContainText(retry.toUpperCase());
    const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
    try {
      const activation = await context.newPage();
      for (const employee of [earlier, overlap]) {
        await context.clearCookies(); await activation.goto("/activate");
        await activation.getByLabel("Employee ID", { exact: true }).fill(employee);
        await activation.getByLabel("Activation or reset code", { exact: true }).fill(codeFor(employee));
        await activation.getByLabel("Choose a password", { exact: true }).fill(QA_PASSWORD);
        await activation.getByLabel("Confirm password", { exact: true }).fill(QA_PASSWORD);
        await activation.getByRole("button", { name: "Save password & sign in", exact: true }).click(); await expect(activation).toHaveURL(/\/privacy-notice$/);
      }
    } finally { await context.close(); }
  } finally { await removeFault(); }
});
