import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, firefox, type TestInfo } from "@playwright/test";
import { assertLocalQa, capture, expectNoPageOverflow, signIn, withDb, type Person } from "../e2e/support";
import { assertQaNodeTls, localChromiumTls } from "../e2e/qa-tls";

/** Supplemental regression on the retained large development corpus. No seed,
 * fixture cleanup or business mutation. Only the streamed reveal timing changes.
 * Start Node with NODE_EXTRA_CA_CERTS=$PWD/.artifacts/qa-tls/localhost.crt.
 */
async function main() {
  assertLocalQa();
  const baseURL = process.env.QA_BASE ?? "https://localhost:3443";
  assertQaNodeTls(localChromiumTls(baseURL));
  const database = new URL(process.env.DATABASE_URL!);
  if (database.pathname !== "/welearn_dev") throw new Error("This regression requires the preserved large welearn_dev corpus");
  const out = process.env.QA_OUT ?? ".artifacts/qa-capture-readiness";
  mkdirSync(out, { recursive: true });
  const fixture = await withDb(async db => {
    const admin = (await db.query("SELECT id,employee_id,name,role,totp_secret FROM users WHERE employee_id ~ '^QA[A-F0-9]{12}$' AND role='ADMIN' AND password_state='ACTIVE' AND totp_secret IS NOT NULL ORDER BY created_at,id LIMIT 1")).rows[0];
    const policy = (await db.query("SELECT id,title,body FROM policy_docs WHERE title LIKE 'QA policy %' AND status='ACTIVE' ORDER BY created_at DESC,id LIMIT 1")).rows[0];
    if (!admin || !policy) throw new Error("Existing fictional QA admin and policy prerequisites are required");
    return { person: { id: admin.id, employeeId: admin.employee_id, name: admin.name, role: admin.role, totpSecret: admin.totp_secret } as Person,
      policy: { id: policy.id, title: policy.title },
      counts: (await db.query("SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM policy_docs) policies")).rows[0] };
  });
  const browser = await firefox.launch();
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  context.setDefaultTimeout(10_000); context.setDefaultNavigationTimeout(30_000);
  await context.tracing.start({ screenshots: true, snapshots: true });
  const result: Record<string, unknown> = {
    status: "RUNNING", checkoutCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    runtimeBuildCommit: process.env.QA_BUILD_COMMIT ?? null, buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    database: { host: database.hostname, port: database.port, name: database.pathname.slice(1) },
    browser: { name: "Firefox", version: browser.version() }, viewport: { width: 1440, height: 900 },
    fixture: { policy: fixture.policy, counts: fixture.counts },
    scope: "Actual retained large policy document; response content unchanged except explicit streamed-reveal timing. Authentication only; no business writes.",
  };
  try {
    const login = await context.newPage(); await signIn(login, fixture.person); await login.close();
    for (const phase of ["original-text-only", "visible-readiness"] as const) {
      const page = await context.newPage();
      let releaseScripts = () => {};
      const scripts = new Promise<void>(resolve => { releaseScripts = resolve; });
      await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async route => { await scripts; await route.continue(); });
      const path = `/admin/corpus?doc=${fixture.policy.id}`;
      const sample: Record<string, unknown> = { attachments: [] };
      result[phase] = sample;
      await page.route(new URL(path, baseURL).href, async route => {
        if (!route.request().isNavigationRequest()) return route.continue();
        const response = await route.fetch(); expect(response.status()).toBe(200);
        const original = await response.text();
        let replacements = 0;
        const body = original.replace(/\$RC\("B:\d+","S:\d+"\)/g, call => {
          replacements++;
          return `(window.__qaStreamReveals??=[]).push(()=>${call})`;
        });
        expect(replacements, "The actual streamed reveal must be gated").toBeGreaterThan(0);
        const hash = (text: string) => createHash("sha256").update(text).digest("hex");
        sample.transport = { status: response.status(), replacements, originalBytes: Buffer.byteLength(original), originalSha256: hash(original), delayedSha256: hash(body) };
        writeFileSync(join(out, `${phase}-original.html`), original, { mode: 0o600 });
        writeFileSync(join(out, `${phase}-delayed.html`), body, { mode: 0o600 });
        await route.fulfill({ response, body });
      });
      try {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        const article = page.locator("article");
        await expect(article).toContainText(fixture.policy.title);
        await expect(article).toBeHidden();
        const geometry = () => page.evaluate(() => ({ rootHeight: document.documentElement.scrollHeight, bodyHeight: document.body.scrollHeight, width: document.documentElement.scrollWidth, viewport: { width: innerWidth, height: innerHeight }, ready: document.readyState, articleHidden: !!document.querySelector("article")?.closest("[hidden]") }));
        sample.hidden = await geometry();
        const reveal = () => page.evaluate("window.__qaStreamReveals.splice(0).forEach(reveal => reveal())");
        const info = {
          project: { name: "firefox-desktop" }, outputPath: (name: string) => join(out, `${phase}-${name}`),
          attach: async (name: string, data: { body?: string | Buffer; path?: string; contentType: string }) => {
            (sample.attachments as unknown[]).push({ name, ...data, ...(data.body ? { body: data.body.toString() } : {}) });
          },
        } as unknown as TestInfo;
        if (phase === "original-text-only") {
          // Force the observed boundary exactly: real short measurement, then
          // reveal the original large DOM immediately before the real screenshot.
          const screenshot = page.screenshot.bind(page);
          page.screenshot = async options => {
            await reveal();
            // React schedules the actual streamed DOM replacement after $RC.
            // Require that boundary before exercising the stale short measurement.
            await expect(article).toBeVisible();
            const dimensions = await geometry();
            sample.revealed = dimensions;
            expect(dimensions.rootHeight).toBeGreaterThan(32767);
            return screenshot(options);
          };
          try {
            let failure: unknown;
            try { await capture(page, info, "capture"); } catch (error) { failure = error; }
            expect(String(failure)).toContain("Cannot take screenshot larger than 32767");
            sample.expectedFailure = String(failure);
          } finally { page.screenshot = screenshot; }
        } else {
          // Visibility must remain pending while the original streamed article
          // is hidden. Explicit release, rather than elapsed time, changes it.
          const visible = expect(article).toBeVisible();
          await reveal(); await visible;
          releaseScripts(); await page.waitForLoadState("load");
          await expect(page).toHaveURL(new URL(path, baseURL).href);
          await expect(article).toContainText(fixture.policy.title);
          await expectNoPageOverflow(page);
          const dimensions = await geometry(); sample.revealed = dimensions;
          expect(dimensions.rootHeight).toBeGreaterThan(32767);
          await capture(page, info, "capture");
          const metadata = (sample.attachments as { name: string; body?: string }[]).find(a => a.name === "capture-capture")!;
          expect(JSON.parse(metadata.body!).captureMethod).toBe("Playwright viewport");
          const png = readFileSync(join(out, `${phase}-capture.png`));
          sample.png = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: createHash("sha256").update(png).digest("hex") };
          expect(sample.png).toMatchObject({ width: 1440, height: 900 });
        }
      } finally { releaseScripts(); await page.close(); }
    }
    result.status = "PASSED";
  } catch (error) { result.status = "FAILED"; result.error = String(error); throw error; }
  finally {
    await context.tracing.stop({ path: join(out, "trace.zip") }); await browser.close();
    result.finishedAt = new Date().toISOString(); writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: result.status, output: out }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
