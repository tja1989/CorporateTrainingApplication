import { loadEnv } from "../lib/env";
import { chromium, type Page, type BrowserContext } from "@playwright/test";
import { Client } from "pg";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cpus, platform, release } from "node:os";
import { totpCode } from "../lib/auth/totp";

loadEnv();
const base = process.env.QA_BASE ?? "https://localhost:3443";
const out = process.env.QA_OUT ?? ".artifacts/performance";
const requestedFamilies = (process.env.QA_FAMILIES ?? "home,catalog,course,lesson,manager,admin").split(",");
if (requestedFamilies.some(family => !["home", "catalog", "course", "lesson", "manager", "admin"].includes(family))) throw new Error("Unknown performance family");
if (!/^[a-f0-9]{40}$/.test(process.env.QA_BUILD_COMMIT ?? "")) throw new Error("Set QA_BUILD_COMMIT to the recorded production build's source commit, not merely current HEAD");
if (!["0", "1"].includes(process.env.QA_BUILD_DIRTY ?? "")) throw new Error("Set QA_BUILD_DIRTY=0 for a clean build or1 for interim working-tree measurements");
const config = {
  viewport: { width: 390, height: 844 },
  cpuSlowdownMultiplier: 4,
  network: { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 },
  observationMs: 5_000,
  repetitions: 3,
  budgets: { lcpMs: 2_500, cls: 0.1, interactionMs: 200 },
};
type Entry = { startTime: number; value?: number; hadRecentInput?: boolean; duration?: number; interactionId?: number };
type Measurements = { lcp: Entry[]; shifts: Entry[]; events: Entry[]; eventSupported: boolean; clickCount: number; keydownCount: number };
type Run = { route: string; family: string; repetition: number; lcpMs: number | null; cls: number; interactionMsUpperBound: number | null; interaction: string; screenshot: string };
const local = (value: string) => ["localhost", "127.0.0.1"].includes(new URL(value).hostname);
if (!local(base) || !local(process.env.DATABASE_URL ?? "https://invalid") || !new URL(process.env.DATABASE_URL!).pathname.startsWith("/welearn_")) throw new Error("Performance qualification requires isolated local welearn services");

async function login(page: Page, db: Client, employeeId: string) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Employee ID", { exact: true }).fill(employeeId);
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(url => url.pathname !== "/login");
  if (new URL(page.url()).pathname === "/login/mfa") {
    const secret = (await db.query("SELECT totp_secret FROM users WHERE employee_id=$1", [employeeId])).rows[0]?.totp_secret;
    if (!secret) throw new Error("Complete the synthetic admin's MFA setup through the QA UI before measurement");
    await page.getByLabel("Authenticator code", { exact: true }).fill(totpCode(secret));
    await page.getByRole("button", { name: "Verify & continue", exact: true }).click();
    await page.waitForURL(url => url.pathname !== "/login/mfa");
  }
  if (new URL(page.url()).pathname === "/privacy-notice") {
    await page.getByRole("button", { name: /I understand/ }).click();
    await page.waitForURL(url => url.pathname !== "/privacy-notice");
  }
  if (new URL(page.url()).pathname.startsWith("/login")) throw new Error("Synthetic account setup incomplete");
}

async function observe(context: BrowserContext) {
  await context.addInitScript(() => {
    const data = { lcp: [] as unknown[], shifts: [] as unknown[], events: [] as unknown[], eventSupported: PerformanceObserver.supportedEntryTypes.includes("event") };
    Object.assign(window, { __welearnQaPerformance: data });
    for (const [type, target] of [["largest-contentful-paint", "lcp"], ["layout-shift", "shifts"], ["event", "events"]] as const) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) data[target].push(entry.toJSON());
      });
      observer.observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) });
    }
  });
}

async function readMeasurements(page: Page): Promise<Measurements> {
  return page.evaluate(() => {
    const data = (window as unknown as { __welearnQaPerformance: Omit<Measurements, "clickCount" | "keydownCount"> }).__welearnQaPerformance;
    const counts = (performance as unknown as { eventCounts?: Map<string, number> }).eventCounts;
    return { ...data, clickCount: counts?.get("click") ?? 0, keydownCount: counts?.get("keydown") ?? 0 };
  });
}

function maxClsSession(entries: Entry[]) {
  let max = 0, sum = 0, first = 0, last = 0;
  for (const entry of entries.filter(entry => !entry.hadRecentInput).sort((a, b) => a.startTime - b.startTime)) {
    if (!sum || entry.startTime - last > 1_000 || entry.startTime - first > 5_000) { sum = 0; first = entry.startTime; }
    sum += entry.value ?? 0; last = entry.startTime; max = Math.max(max, sum);
  }
  return max;
}

async function interact(page: Page, family: string) {
  if (family === "catalog") {
    const field = page.getByRole("search", { name: "Filter courses" }).getByLabel("Search courses", { exact: true });
    await field.pressSequentially("food");
    if (await field.inputValue() !== "food") throw new Error("Catalog typing did not update the visible field");
    return "Type a course query into the catalog filter";
  }
  if (family === "course") {
    const summary = page.getByRole("navigation", { name: "Course contents", exact: true }).locator("summary").first();
    const before = await summary.evaluate(element => element.parentElement?.hasAttribute("open"));
    await summary.click();
    await page.waitForFunction(({ open }) => document.querySelector('nav[aria-label="Course contents"] details')?.hasAttribute("open") !== open, { open: before });
    return "Expand or collapse a course module";
  }
  if (family === "lesson") {
    await page.getByRole("button", { name: "Course contents", exact: true }).click();
    await page.getByRole("dialog", { name: "Course contents", exact: true }).waitFor();
    return "Open mobile lesson contents";
  }
  if (family === "manager" || family === "admin") {
    await page.getByRole("button", { name: `Open ${family} workspace navigation`, exact: true }).click();
    await page.getByRole("dialog").waitFor();
    return "Open workspace navigation";
  }
  await page.locator('summary[aria-label="Profile and account"]').click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  return "Open Home account navigation";
}

async function main() {
  mkdirSync(out, { recursive: true });
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const course = (await db.query("SELECT id FROM courses WHERE title='Food Safety Essentials' AND status='PUBLISHED' LIMIT 1")).rows[0]?.id;
  const lesson = (await db.query("SELECT l.id FROM lessons l JOIN modules m ON m.id=l.module_id WHERE m.course_id=$1 AND l.type='VIDEO' ORDER BY m.sort,l.sort LIMIT 1", [course])).rows[0]?.id;
  if (!course || !lesson) throw new Error("Seeded performance content is missing");
  const dataset = (await db.query("SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM courses) courses,(SELECT count(*)::int FROM courses WHERE status='PUBLISHED') published_courses,(SELECT count(*)::int FROM enrollments) enrollments,(SELECT count(*)::int FROM attempts) attempts,(SELECT count(*)::int FROM hr_tickets) tickets")).rows[0];
  const browser = await chromium.launch();
  const runs: Run[] = [];
  const metadata = { runtimeBuildId: readFileSync(".next/BUILD_ID", "utf8").trim(), measuredAt: new Date().toISOString(), buildCommit: process.env.QA_BUILD_COMMIT, buildDirty: process.env.QA_BUILD_DIRTY === "1", checkoutCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), checkoutDirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(), base, dataset, database: new URL(process.env.DATABASE_URL!).pathname.slice(1), browser: browser.version(), host: { platform: platform(), release: release(), cpu: cpus()[0]?.model }, config, requestedFamilies, limitations: "Production-build local lab measurements with simulated mobile CPU/network and cold browser cache. Single representative interactions, instrumented with traces; not field Core Web Vitals or physical-device results. Public video embeds remain real network requests. A subset run does not qualify omitted families." };
  try {
    for (const persona of [
      { employeeId: "AE10023", routes: [{ family: "home", route: "/home" }, { family: "catalog", route: "/learn?view=browse" }, { family: "course", route: `/course/${course}` }, { family: "lesson", route: `/lesson/${lesson}` }] },
      { employeeId: "AE20001", routes: [{ family: "manager", route: "/team" }] },
      { employeeId: "AE90001", routes: [{ family: "admin", route: "/admin" }] },
    ]) {
      if (!persona.routes.some(item => requestedFamilies.includes(item.family))) continue;
      const authContext = await browser.newContext({ ignoreHTTPSErrors: true });
      await login(await authContext.newPage(), db, persona.employeeId);
      const storageState = await authContext.storageState();
      await authContext.close();
      for (const { family, route } of persona.routes.filter(item => requestedFamilies.includes(item.family))) for (let repetition = 1; repetition <= config.repetitions; repetition++) {
        const context = await browser.newContext({ storageState, viewport: config.viewport, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
        await observe(context);
        await context.tracing.start({ screenshots: true, snapshots: true });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.emulateNetworkConditions", config.network);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: config.cpuSlowdownMultiplier });
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
        await page.locator("h1").first().waitFor();
        // A fixed observation window is intentional measurement sampling, not a test retry.
        await page.waitForTimeout(config.observationMs);
        const before = await readMeasurements(page);
        const screenshot = `${family}-${repetition}.png`;
        await page.screenshot({ path: `${out}/${screenshot}`, fullPage: true });
        const interaction = await interact(page, family);
        await page.waitForTimeout(500); // Event Timing is delivered asynchronously after paint.
        const after = await readMeasurements(page);
        const durations = after.events.filter(entry => entry.interactionId).map(entry => entry.duration ?? 0);
        const occurred = after.clickCount > before.clickCount || after.keydownCount > before.keydownCount;
        const interactionMsUpperBound = !after.eventSupported || !occurred ? null : durations.length ? Math.max(...durations) : 16;
        runs.push({ family, route, repetition, lcpMs: before.lcp.at(-1)?.startTime ?? null, cls: maxClsSession(after.shifts), interactionMsUpperBound, interaction, screenshot });
        writeFileSync(`${out}/results.json`, JSON.stringify({ metadata, runs }, null, 2));
        await context.tracing.stop({ path: `${out}/${family}-${repetition}.zip` });
        await context.close();
        console.log(`Measured ${family} run${repetition}: LCP ${runs.at(-1)!.lcpMs?.toFixed(0)}ms, CLS ${runs.at(-1)!.cls.toFixed(4)}, interaction <=${interactionMsUpperBound}ms`);
      }
    }
    const median = (values: Array<number | null>) => values.some(value => value === null) ? null : (values as number[]).sort((a, b) => a - b)[1];
    const summary = [...new Set(runs.map(run => run.family))].map(family => {
      const samples = runs.filter(run => run.family === family);
      const lcpMs = median(samples.map(run => run.lcpMs)), cls = median(samples.map(run => run.cls)), interactionMsUpperBound = median(samples.map(run => run.interactionMsUpperBound));
      return { family, lcpMs, cls, interactionMsUpperBound, passed: lcpMs !== null && lcpMs <= config.budgets.lcpMs && cls !== null && cls <= config.budgets.cls && interactionMsUpperBound !== null && interactionMsUpperBound <= config.budgets.interactionMs };
    });
    writeFileSync(`${out}/results.json`, JSON.stringify({ metadata, runs, summary }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    if (summary.some(result => !result.passed)) process.exitCode = 1;
  } finally { await browser.close(); await db.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
