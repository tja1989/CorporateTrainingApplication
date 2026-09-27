import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Locator, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./native-zoom-test";
import { capture, createPerson, expectNoPageOverflow, signIn, withDb } from "./support";
import { textCourse } from "./qualification-fixtures";

async function readableTable(page: Page, region: Locator, precedingControl: Locator, info: TestInfo, label: string, identifiers: string[]) {
  await expect(region).toBeVisible();
  const geometry = await region.evaluate(element => {
    const cells = [...element.querySelectorAll("tbody td")];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      region: { width: element.clientWidth, contentWidth: element.scrollWidth },
      words: cells.flatMap(cell => {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const words: Array<{ text: string; lines: number; tops: number[] }> = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const match of (node.textContent ?? "").matchAll(/[\p{L}\p{N}_]+/gu)) {
            const tops = [];
            for (let i = match.index!; i < match.index! + match[0].length; i++) {
              const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
              tops.push(Math.round(range.getBoundingClientRect().top));
            }
            words.push({ text: match[0], lines: new Set(tops).size, tops });
          }
        }
        return words;
      }),
    };
  });
  await info.attach(`${label}-word-geometry`, { body: JSON.stringify(geometry), contentType: "application/json" });
  await capture(page, info, label);
  for (const id of identifiers) expect(geometry.words.some(word => word.text === id), `${label}: identifier measured`).toBe(true);
  expect.soft(geometry.words.filter(word => word.lines > 1), `${label}: words and identifiers must not fragment between lines`).toEqual([]);
  await expectNoPageOverflow(page);
  if (geometry.region.contentWidth > geometry.region.width + 1) {
    // Enter through native keyboard traversal, not programmatic region focus.
    // macOS-host WebKit uses Option+Tab to traverse all links and tab stops.
    await precedingControl.focus();
    await page.keyboard.press(info.project.name.startsWith("webkit") ? "Alt+Tab" : "Tab");
    await expect(region).toBeFocused();
    const style = await region.evaluate(el => ({
      outline: getComputedStyle(el).outlineStyle, shadow: getComputedStyle(el).boxShadow,
      documentHasFocus: document.hasFocus(), visibilityState: document.visibilityState,
      focused: document.activeElement === el, region: el.getBoundingClientRect().toJSON(),
      finalColumn: el.querySelector("tbody tr td:last-child")!.getBoundingClientRect().toJSON(),
      scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
    }));
    // WebKit's native overflow scrolling ignores a zero-duration key gesture.
    // The same observed behavior occurs in a plain native overflow control.
    const keyDuration = info.project.name.startsWith("webkit") ? 80 : 0;
    await info.attach(`${label}-keyboard-entry`, { body: JSON.stringify({ ...style, method: info.project.name.startsWith("webkit") ? "Option+Tab" : "Tab", arrowKeyDurationMs: keyDuration }), contentType: "application/json" });
    expect(style.outline !== "none" || style.shadow !== "none", `${label}: scroll region focus is visible`).toBe(true);
    await page.keyboard.press("ArrowRight", { delay: keyDuration });
    await expect.poll(() => region.evaluate(el => el.scrollLeft), { message: `${label}: keyboard scrolls the table` }).toBeGreaterThan(0);
    // Real arrow key actions reveal the remaining columns; the document stays put.
    for (let i = 0; i < Math.ceil(geometry.region.contentWidth / 30); i++) await page.keyboard.press("ArrowRight", { delay: keyDuration });
    await expect.poll(() => region.evaluate(el => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThanOrEqual(1);
    const last = await region.evaluate(el => {
      const cell = el.querySelector("tbody tr td:last-child")!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        visible: cell.right <= box.right + 1 && cell.left >= box.left - 1, pageX: scrollX,
        documentHasFocus: document.hasFocus(), visibilityState: document.visibilityState,
        focused: document.activeElement === el, region: box.toJSON(), finalColumn: cell.toJSON(),
        scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
      };
    });
    await info.attach(`${label}-keyboard-last-column-geometry`, { body: JSON.stringify(last), contentType: "application/json" });
    expect(last.visible, `${label}: final column can be read`).toBe(true); expect(last.pageX).toBe(0);
    await capture(page, info, `${label}-keyboard-last-column`, { viewportOnly: true });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`@core @template Report identifiers and status words remain readable with contained keyboard scrolling in ${theme}`, async ({ page, context, baseURL }, info) => {
    test.setTimeout(120_000);
    await context.addCookies([{ name: "ll_theme", value: theme, url: baseURL! }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const manager = await createPerson("MANAGER"), admin = await createPerson("ADMIN");
    const learners = await Promise.all([0, 1, 2].map(i => createPerson("LEARNER", { managerId: manager.id, name: `Alexandria Malayalam മലയാളം ${i}` })));
    const outsider = await createPerson("LEARNER", { name: "Outside manager scope" });
    const fixture = await textCourse(learners[0].id);
    const store = `Readability${randomUUID().replaceAll("-", "")}`, storeId = randomUUID();
    const title = "Handling delicate merchandise and customer requests";
    const statuses = ["OVERDUE", "DUE_SOON", "COMPLETED_EXPIRING", "OVERDUE"];
    await withDb(async db => {
      await db.query("INSERT INTO org_units(id,type,name) VALUES($1,'store',$2)", [storeId, store]);
      await db.query("UPDATE courses SET title=$2 WHERE id=$1", [fixture.course, title]);
      for (const [i, person] of [...learners, outsider].entries()) {
        await db.query("UPDATE users SET store_id=$2 WHERE id=$1", [person.id, storeId]);
        if (i) await db.query("INSERT INTO enrollments(id,user_id,course_id,source) VALUES($1,$2,$3,'manual')", [randomUUID(), person.id, fixture.course]);
        // Report-only prerequisites, not a claim of earned learning or compliance.
        await db.query("UPDATE enrollments SET compliance_status=$3,due_at='2026-01-01' WHERE user_id=$1 AND course_id=$2", [person.id, fixture.course, statuses[i]]);
      }
    });
    for (const actor of [manager, admin]) {
      await context.clearCookies(); await context.addCookies([{ name: "ll_theme", value: theme, url: baseURL! }]);
      await signIn(page, actor);
      const base = actor.role === "MANAGER" ? "/team/reports" : "/admin/reports";
      await page.goto(`${base}?${new URLSearchParams({ report: "compliance", store })}`);
      const table = page.getByRole("region", { name: "Compliance matrix table", exact: true });
      const expected = actor.role === "MANAGER" ? learners : [...learners, outsider];
      await expect(table.locator("tbody tr")).toHaveCount(expected.length);
      const visible = await table.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.querySelectorAll("td")].map(cell => cell.textContent!.trim())));
      expect(visible.map(row => row[1]).sort()).toEqual(expected.map(person => person.employeeId).sort());
      const download = page.waitForEvent("download"); await page.getByRole("link", { name: "Export CSV", exact: true }).click();
      const csv = readFileSync((await (await download).path())!, "utf8").replace(/^\uFEFF/, "");
      const csvValues = csv.trim().split(/\r?\n/).slice(1).map(line => line.split(",").map((cell, i) => i === 4 ? cell.replaceAll("_", " ") : cell));
      expect(csvValues).toEqual(visible);
      await info.attach(`${actor.role}-${theme}-report.csv`, { body: csv, contentType: "text/csv" });
      await readableTable(page, table, page.getByRole("link", { name: "Export CSV", exact: true }), info, `${actor.role}-${theme}-report`, expected.map(person => person.employeeId));
      await page.getByRole("textbox", { name: "Ask reports", exact: true }).fill(`Show compliance for store ${store}`);
      const response = page.waitForResponse(r => r.url().endsWith("/api/reports/ask") && r.request().method() === "POST");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      expect((await response).status()).toBe(200);
      const ask = page.getByRole("region", { name: "Ask Reports table", exact: true });
      await expect(ask.locator("tbody tr")).toHaveCount(expected.length);
      const askValues = await ask.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.querySelectorAll("td")].map(cell => cell.textContent!.trim())));
      expect(askValues.map(row => row.map((cell, i) => i === 4 ? cell.replaceAll("_", " ") : cell))).toEqual(visible);
      await readableTable(page, ask, page.getByRole("button", { name: "Ask", exact: true }), info, `${actor.role}-${theme}-ask`, expected.map(person => person.employeeId));
      const axe = await new AxeBuilder({ page }).include('[aria-label="Compliance matrix table"], [aria-label="Ask Reports table"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      await info.attach(`${actor.role}-${theme}-tables-axe`, { body: JSON.stringify(axe.violations), contentType: "application/json" });
      expect(axe.violations).toEqual([]);
    }
  });
}
