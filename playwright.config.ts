import { defineConfig } from "@playwright/test";
import { loadEnv } from "./lib/env";
import { localChromiumTls, assertQaNodeTls } from "./e2e/qa-tls";

loadEnv();
const baseURL = process.env.QA_BASE ?? "https://localhost:3443";
const chromiumTls = localChromiumTls(baseURL);
assertQaNodeTls(chromiumTls);
const chromiumUse = { browserName: "chromium" as const, ignoreHTTPSErrors: chromiumTls.ignoreHTTPSErrors, launchOptions: { args: chromiumTls.args } };
const outputDir = process.env.QA_OUT ?? "test-results";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
  throw new Error("Browser qualification must use the isolated local application.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // Fixtures and artifact paths are unique; service/performance runs stay separate.
  workers: 2,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: `${outputDir}/test-results`,
  reporter: [["list"], ["html", { open: "never", outputFolder: `${outputDir}/html` }], ["json", { outputFile: `${outputDir}/results.json` }]],
  use: {
    baseURL,
    // Chromium uses the exact QA certificate pin; other engines retain their
    // local-context exception below, guarded against remote targets.
    ignoreHTTPSErrors: false,
    trace: "on",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium-native-zoom", testMatch: "**/quality-qualification.e2e.ts", use: { ...chromiumUse, viewport: { width: 1280, height: 800 } } },
    { name: "chromium-desktop", use: { ...chromiumUse, viewport: { width: 1440, height: 900 } } },
    { name: "chromium-mobile", use: { ...chromiumUse, viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "chromium-small", grep: /@template/, use: { ...chromiumUse, viewport: { width: 360, height: 800 }, hasTouch: true } },
    { name: "chromium-tablet", grep: /@template/, use: { ...chromiumUse, viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "chromium-laptop", grep: /@template/, use: { ...chromiumUse, viewport: { width: 1280, height: 800 } } },
    { name: "firefox-desktop", grep: /@core/, use: { browserName: "firefox", ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } } },
    { name: "firefox-mobile", grep: /@core/, use: { browserName: "firefox", ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "webkit-desktop", grep: /@core/, use: { browserName: "webkit", ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } } },
    { name: "webkit-mobile", grep: /@core/, use: { browserName: "webkit", ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
