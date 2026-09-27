import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createPerson, signIn, withDb, capture } from "./support";
import { textCourse } from "./qualification-fixtures";

test("@core Earned certificate preserves long multilingual names and titles, with identical course, Home and profile completion", async ({ page }, info) => {
  const name = "Amina محمد أحمد शर्मा അഞ്ജലി Corporate Training Qualification";
  const title = "Safety and customer service training العربية हिंदी മലയാളം for the entire frontline retail team";
  const learner = await createPerson("LEARNER", { name }), f = await textCourse(learner.id, { title, certificate: true });
  await signIn(page, learner);
  await page.getByRole("link", { name: "Continue lesson", exact: true }).click();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByText("Lesson complete", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText("Lesson complete", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Course overview", exact: true }).click();
  await expect(page.getByRole("link", { name: /certificate/i })).toBeVisible();
  await page.goto("/home");
  await expect(page.getByRole("link", { name: "Continue lesson", exact: true })).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByRole("region", { name: "Learning history", exact: true })).toContainText(title);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF", exact: true }).click();
  const file = await download;
  const pdf = info.outputPath("earned-unicode-certificate.pdf");
  await file.saveAs(pdf);
  await info.attach("earned-certificate", { path: pdf, contentType: "application/pdf" });
  const text = execFileSync("pdftotext", ["-enc", "UTF-8", pdf, "-"], { encoding: "utf8" });
  writeFileSync(info.outputPath("certificate-extracted.txt"), text);
  expect(text).toContain("xprtn");
  // Complex-script extraction order varies; each non-Latin script must survive as text, not byte-truncated garbage.
  expect(text).toMatch(/\p{Script=Arabic}/u); expect(text).toMatch(/\p{Script=Devanagari}/u); expect(text).toMatch(/\p{Script=Malayalam}/u);
  expect(text).toContain("frontline retail team");
  expect(execFileSync("pdfinfo", [pdf], { encoding: "utf8" })).toMatch(/Pages:\s+1/);
  const cert = await withDb(async db => (await db.query("SELECT serial FROM certificates WHERE user_id=$1 AND course_id=$2", [learner.id, f.course])).rows);
  expect(cert).toHaveLength(1); expect(text).toContain(cert[0].serial);
  await info.attach("persistence", { body: JSON.stringify({ learner: learner.id, course: f.course, certificate: cert[0], extracted: text }), contentType: "application/json" });
  await capture(page, info, "multilingual-profile");
});
