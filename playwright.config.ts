import { defineConfig } from "@playwright/test";
import { loadEnv } from "./lib/env";

loadEnv();
const baseURL = process.env.QA_BASE ?? "https://localhost:3443";
const outputDir = process.env.QA_OUT ?? "test-results";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
  throw new Error("Browser qualification must use the isolated local application.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: `${outputDir}/test-results`,
  reporter: [["list"], ["html", { open: "never", outputFolder: `${outputDir}/html` }], ["json", { outputFile: `${outputDir}/results.json` }]],
  use: {
    baseURL,
    // Only the local QA certificate is self-signed; the hostname guard above
    // prevents this setting from weakening checks against a deployed service.
    ignoreHTTPSErrors: true,
    trace: "on",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium-native-zoom", testMatch: "**/quality-qualification.e2e.ts", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    { name: "chromium-desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "chromium-mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "chromium-small", grep: /@template/, use: { browserName: "chromium", viewport: { width: 360, height: 800 }, hasTouch: true } },
    { name: "chromium-tablet", grep: /@template/, use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "chromium-laptop", grep: /@template/, use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    { name: "firefox-desktop", grep: /@core/, use: { browserName: "firefox", viewport: { width: 1440, height: 900 } } },
    { name: "firefox-mobile", grep: /@core/, use: { browserName: "firefox", viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "webkit-desktop", grep: /@core/, use: { browserName: "webkit", viewport: { width: 1440, height: 900 } } },
    { name: "webkit-mobile", grep: /@core/, use: { browserName: "webkit", viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
