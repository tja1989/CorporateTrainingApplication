import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

/** Hold only initial application scripts; browser input and real server actions remain real. */
export async function delayedHydration(browser: Browser, baseURL: string, info: TestInfo, storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>) {
  const context = await browser.newContext({ baseURL, storageState,
    ignoreHTTPSErrors: info.project.use.ignoreHTTPSErrors,
    viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch });
  context.setDefaultTimeout(10_000); context.setDefaultNavigationTimeout(30_000);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await context.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async route => { await gate; await route.continue(); });
  const page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  return { context, page, release, errors, close: async () => {
    release(); await context.close();
  } };
}

export async function releaseAuthHydration(page: Page, release: () => void) {
  release(); await page.waitForLoadState("load");
  // An actual independent client handler establishes hydration without reading React internals.
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
}
