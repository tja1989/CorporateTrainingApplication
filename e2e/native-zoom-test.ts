import { test as base, chromium, type BrowserContext } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localChromiumTls } from "./qa-tls";

type ZoomOptions = {
  baseURL: string;
  viewport: { width: number; height: number };
  temporaryRoot: string;
};

/** Real browser zoom, isolated from the user's browser and default preferences.
 * https://playwright.dev/docs/chrome-extensions
 * https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom
 */
export async function launchNativeZoomContext(options: ZoomOptions) {
  const origin = new URL(options.baseURL);
  const tls = localChromiumTls(options.baseURL);
  if (!["localhost", "127.0.0.1"].includes(origin.hostname)) {
    throw new Error("Native zoom qualification requires the isolated local app");
  }
  const extension = join(options.temporaryRoot, "extension");
  mkdirSync(extension, { recursive: true });
  writeFileSync(join(extension, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    name: "welearn isolated native zoom fixture",
    version: "1.0",
    host_permissions: [`${origin.protocol}//${origin.hostname}/*`],
    background: { service_worker: "worker.js" },
  }));
  writeFileSync(join(extension, "worker.js"), "chrome.runtime.onInstalled.addListener(() => {});\n");
  const context = await chromium.launchPersistentContext(join(options.temporaryRoot, "profile"), {
    channel: "chromium",
    headless: true,
    baseURL: options.baseURL,
    viewport: options.viewport,
    ignoreHTTPSErrors: tls.ignoreHTTPSErrors,
    args: [...tls.args, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const setupPage = context.pages()[0] ?? await context.newPage();
    await setupPage.goto(`${origin.origin}/login`);
    const before = await setupPage.evaluate(() => ({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio }));
    const factor = await worker.evaluate(async (targetOrigin) => {
      type Tabs = {
        query(query: Record<string, unknown>): Promise<Array<{ id?: number; url?: string }>>;
        setZoomSettings(id: number, settings: { mode: "automatic"; scope: "per-origin" }): Promise<void>;
        setZoom(id: number, factor: number): Promise<void>;
        getZoom(id: number): Promise<number>;
      };
      const tabs = (globalThis as unknown as { chrome: { tabs: Tabs } }).chrome.tabs;
      const matching = (await tabs.query({})).filter(tab => tab.url && new URL(tab.url).origin === targetOrigin);
      if (matching.length !== 1 || matching[0].id === undefined) throw new Error("Expected one local setup tab");
      const id = matching[0].id;
      // Automatic mode makes Chromium scale/reflow the page. Manual mode would
      // only emit an extension event and would not qualify native page zoom.
      await tabs.setZoomSettings(id, { mode: "automatic", scope: "per-origin" });
      await tabs.setZoom(id, 2);
      return tabs.getZoom(id);
    }, origin.origin);
    await setupPage.waitForFunction(({ width, ratio }) =>
      Math.abs(innerWidth - width / 2) <= 1 && Math.abs(devicePixelRatio - ratio * 2) < 0.01,
    before);
    const after = await setupPage.evaluate(() => ({
      width: innerWidth, height: innerHeight, ratio: devicePixelRatio,
      cssZoom: getComputedStyle(document.documentElement).zoom,
    }));
    if (factor !== 2 || after.cssZoom !== "1") throw new Error("Native zoom was not applied independently of CSS zoom");
    const metadata = {
      method: "Chrome tabs.setZoom(2), automatic mode, isolated persistent Chromium profile",
      factor, before, after, viewport: options.viewport, tls: tls.metadata,
      browser: context.browser()?.version() ?? "Bundled Chromium",
      limits: "Native Chromium page zoom; no claim about physical iPhone or personal Chrome UI settings",
    };
    return { context, metadata };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export const test = base.extend({
  context: async ({ context, baseURL, viewport }, use, testInfo) => {
    if (testInfo.project.name !== "chromium-native-zoom") {
      await use(context);
      return;
    }
    if (!baseURL || !viewport) throw new Error("Native zoom project needs local baseURL and a fixed viewport");
    const temporaryRoot = mkdtempSync(join(tmpdir(), "welearn-native-zoom-"));
    let nativeContext: BrowserContext | undefined;
    try {
      const started = await launchNativeZoomContext({ baseURL, viewport, temporaryRoot });
      nativeContext = started.context;
      await testInfo.attach("native-zoom-method", {
        body: JSON.stringify(started.metadata, null, 2), contentType: "application/json",
      });
      await use(nativeContext);
    } finally {
      await nativeContext?.close();
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  },
});

export { expect } from "@playwright/test";
