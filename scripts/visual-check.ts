import { loadEnv } from "../lib/env";
loadEnv();

import { createRequire } from "module";
import { mkdirSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";
import { totpCode } from "../lib/auth/totp";

/**
 * Visual regression helper: logs in as each demo persona and captures every
 * key screen in light + dark, mobile + desktop. Uses the machine's global
 * Playwright install (no npm dependency).
 *
 *   BASE=http://localhost:3000 OUT=./screens npx tsx scripts/visual-check.ts
 *
 * Env: BASE (default http://localhost:3000), OUT (default ./screens),
 *      THEMES (light,dark), VIEWPORTS (mobile,desktop), PLAYWRIGHT_MODULE.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = resolve(process.env.OUT ?? "./screens");
const THEMES = (process.env.THEMES ?? "light,dark").split(",") as Array<"light" | "dark">;
const VIEWPORTS = (process.env.VIEWPORTS ?? "mobile,desktop").split(",");
const VP: Record<string, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};
const PW = process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright";
const PASSWORD = "demo1234";
const ONLY = process.env.PERSONAS?.split(",").filter(Boolean);
/** Set the first time the admin completes TOTP enrolment; reused for later logins in this run. */
let adminSecret: string | null = null;

type Persona = { id: string; employeeId: string; routes: string[] };

/* Minimal structural types for the global Playwright module (not an npm dependency of this app). */
type Page = {
  goto(url: string, opts?: { waitUntil?: "load" | "domcontentloaded" | "networkidle" }): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitForURL(predicate: (url: URL) => boolean): Promise<void>;
  url(): string;
  textContent(selector: string): Promise<string | null>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(opts: { path: string; fullPage?: boolean }): Promise<unknown>;
  setDefaultTimeout(ms: number): void;
};
type Context = {
  addCookies(cookies: Array<{ name: string; value: string; url: string }>): Promise<void>;
  newPage(): Promise<Page>;
  close(): Promise<void>;
};
type Browser = {
  newContext(opts: { viewport: { width: number; height: number }; colorScheme: "light" | "dark" }): Promise<Context>;
  close(): Promise<void>;
};
type Playwright = { chromium: { launch(opts: { args: string[] }): Promise<Browser> } };

async function main() {
  mkdirSync(OUT, { recursive: true });
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const { chromium } = req(PW) as Playwright;

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const q = async (sql: string): Promise<string | null> => {
    try {
      const r = await db.query(sql);
      return (r.rows[0] && (Object.values(r.rows[0])[0] as string)) ?? null;
    } catch {
      return null;
    }
  };
  // Force the admin through TOTP setup so the run is idempotent.
  await db.query("UPDATE users SET totp_secret = NULL WHERE employee_id = 'AE90001'");
  const learnerId = await q("SELECT id FROM users WHERE employee_id = 'AE10023'");
  const courseId =
    (await q(`SELECT course_id FROM enrollments WHERE user_id = '${learnerId}' LIMIT 1`)) ??
    (await q("SELECT id FROM courses LIMIT 1"));
  // Prefer a video lesson inside one of the learner's enrolled courses, in course order.
  const videoLesson =
    (await q(
      `SELECT l.id FROM lessons l JOIN modules m ON m.id = l.module_id JOIN enrollments e ON e.course_id = m.course_id
       WHERE e.user_id = '${learnerId}' AND l.type = 'VIDEO' ORDER BY m.sort, l.sort LIMIT 1`,
    )) ?? (await q("SELECT id FROM lessons WHERE type = 'VIDEO' LIMIT 1"));
  const quizId = await q("SELECT id FROM quizzes LIMIT 1");
  const teamMember =
    (await q("SELECT id FROM users WHERE manager_id = (SELECT id FROM users WHERE employee_id = 'AE20001') LIMIT 1")) ??
    learnerId;
  const adminCourse = await q("SELECT id FROM courses LIMIT 1");
  await db.end();

  const personas: Persona[] = [
    {
      id: "learner",
      employeeId: "AE10023",
      routes: [
        "/home",
        "/learn",
        courseId && `/course/${courseId}`,
        videoLesson && `/lesson/${videoLesson}`,
        quizId && `/quiz/${quizId}`,
        "/drill",
        "/ask-hr",
        "/ask-hr/live",
        videoLesson && `/lesson/${videoLesson}/interview`,
        "/profile",
        "/inbox",
      ].filter(Boolean) as string[],
    },
    { id: "manager", employeeId: "AE20001", routes: ["/team", teamMember && `/team/${teamMember}`, "/team/reports"].filter(Boolean) as string[] },
    {
      id: "admin",
      employeeId: "AE90001",
      routes: ["/admin", "/admin/people", "/admin/reviews", "/admin/reports", adminCourse && `/admin/courses/${adminCourse}`, "/admin/corpus"].filter(
        Boolean,
      ) as string[],
    },
  ];

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  let shots = 0;
  for (const theme of THEMES) {
    for (const vpName of VIEWPORTS) {
      const viewport = VP[vpName];
      // Unauthenticated login screen first
      {
        const ctx = await browser.newContext({ viewport, colorScheme: theme });
        if (theme === "dark") await ctx.addCookies([{ name: "ll_theme", value: "dark", url: BASE }]);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/login`, { waitUntil: "load" });
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/login-${theme}-${vpName}.png`, fullPage: true });
        shots++;
        await ctx.close();
      }
      for (const persona of personas) {
        if (ONLY && !ONLY.includes(persona.id)) continue;
        const ctx = await browser.newContext({ viewport, colorScheme: theme });
        if (theme === "dark") await ctx.addCookies([{ name: "ll_theme", value: "dark", url: BASE }]);
        const page = await ctx.newPage();
        page.setDefaultTimeout(20_000);
        try {
          await login(page, persona.employeeId);
        } catch (err) {
          console.error(`login failed for ${persona.employeeId}:`, err instanceof Error ? err.message : err);
          await ctx.close();
          continue;
        }
        for (const route of persona.routes) {
          const slug = route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/-[0-9a-f-]{20,}$/i, "-id");
          try {
            await page.goto(`${BASE}${route}`, { waitUntil: "load" });
            await page.waitForTimeout(900); // let entry animations + counters settle
            await page.screenshot({ path: `${OUT}/${persona.id}-${slug}-${theme}-${vpName}.png`, fullPage: true });
            shots++;
          } catch (err) {
            console.error(`screenshot failed for ${route}:`, err instanceof Error ? err.message : err);
          }
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(`visual-check: ${shots} screenshots written to ${OUT}`);
}

async function login(page: Page, employeeId: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill('input[name="employeeId"]', employeeId);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => u.pathname !== "/login"), page.click('button[type="submit"]')]);
  // Interstitials can come in either order (privacy notice, TOTP set-up, TOTP check) — handle whatever shows up.
  for (let i = 0; i < 4; i++) {
    const url = page.url();
    if (url.includes("/privacy-notice")) {
      await Promise.all([page.waitForURL((u) => !u.pathname.includes("/privacy-notice")), page.click('button[type="submit"]')]);
    } else if (url.includes("/login/mfa-setup")) {
      const secret = (await page.textContent('[aria-label="TOTP secret"]'))?.trim() ?? "";
      adminSecret = secret;
      await page.fill('input[name="code"]', totpCode(secret));
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login/mfa-setup")), page.click('button[type="submit"]')]);
    } else if (url.includes("/login/mfa")) {
      if (!adminSecret) throw new Error("MFA requested but no secret captured in this run");
      await page.fill('input[name="code"]', totpCode(adminSecret));
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login/mfa")), page.click('button[type="submit"]')]);
    } else {
      return;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
