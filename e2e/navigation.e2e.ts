import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createPerson, signIn, capture, expectNoPageOverflow } from "./support";

test("NAV: keyboard skip link moves focus to content in learner and both workspaces @core", async ({ page, browserName }) => {
  for (const role of ["LEARNER", "MANAGER", "ADMIN"] as const) {
    await page.context().clearCookies(); await signIn(page, await createPerson(role));
    // macOS WebKit uses Option+Tab to include links in keyboard traversal.
    await page.reload(); await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
    await page.keyboard.press("Enter"); await expect(page.locator("#main-content")).toBeFocused();
  }
});

test("NAV: learner navigation, profile disclosure, theme persistence and logout @core @template", async ({ page }, info) => {
  const person = await createPerson("LEARNER");
  await signIn(page, person);
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  const nav = page.getByRole("navigation", { name: mobile ? "Mobile main" : "Main", exact: true });
  await expect(nav).toBeVisible();
  await expect(page.getByRole("link", { name: "xprtn", exact: true })).toBeVisible();
  for (const [name, route] of [[mobile ? "Learning" : "My Learning", "/learn"], ["Practice", "/drill"], ["Home", "/home"]]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    await expectNoPageOverflow(page);
  }
  const account = page.locator('summary[aria-label="Profile and account"]');
  await account.press("Enter");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeHidden();
  await capture(page, info, "learner-light");
  await account.click();
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("h1")).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations.filter(v => ["critical", "serious"].includes(v.impact ?? "")), JSON.stringify(a11y.violations, null, 2)).toEqual([]);
  await capture(page, info, "learner-dark");
  await account.click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('summary[aria-label="Profile and account"]')).toHaveCount(0);
});

for (const role of ["MANAGER", "ADMIN"] as const) {
  test(`NAV: ${role.toLowerCase()} My profile opens a coherent learner workspace @core @template`, async ({ page }, info) => {
    const person = await createPerson(role);
    await signIn(page, person);
    const home = role === "ADMIN" ? "/admin" : "/team";
    const mobile = (page.viewportSize()?.width ?? 1440) < 768;
    const account = page.locator('summary[aria-label="Profile and account"]');
    await account.click();
    await page.getByRole("link", { name: "My profile", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    const nav = page.getByRole("navigation", { name: mobile ? "Mobile main" : "Main", exact: true });
    for (const refresh of [false, true]) {
      if (refresh) await page.reload();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(nav).toBeVisible();
      await expect(page.getByRole("search", { name: "Course search", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Open ${role.toLowerCase()} workspace navigation`, exact: true })).toHaveCount(0);
      await account.click();
      await expect(page.getByText("Learning workspace", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Switch to ${role.toLowerCase()}`, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "View as learner", exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    await expectNoPageOverflow(page);
    await capture(page, info, `${role.toLowerCase()}-learner-profile`);
    await nav.getByRole("link", { name: mobile ? "Learning" : "My Learning", exact: true }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(nav.getByRole("link", { name: mobile ? "Learning" : "My Learning", exact: true })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await account.click();
    await page.getByRole("button", { name: `Switch to ${role.toLowerCase()}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    await expect(page.getByText(`${role === "ADMIN" ? "Admin" : "Manager"} workspace`, { exact: true }).filter({ visible: true })).toBeVisible();
    if (mobile) await expect(page.getByRole("button", { name: `Open ${role.toLowerCase()} workspace navigation`, exact: true })).toBeVisible();
    else await expect(page.getByRole("navigation", { name: "Workspace", exact: true }).filter({ visible: true })).toBeVisible();
  });

  test(`NAV: ${role.toLowerCase()} workspace navigation and return from learner view @core @template`, async ({ page }, info) => {
    const person = await createPerson(role);
    await signIn(page, person);
    const home = role === "ADMIN" ? "/admin" : "/team";
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    const compact = (page.viewportSize()?.width ?? 1440) < 768;
    const trigger = page.getByRole("button", { name: `Open ${role.toLowerCase()} workspace navigation`, exact: true });
    if (compact) {
      await trigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await trigger.click();
    }
    const workspace = page.getByRole("navigation", { name: "Workspace", exact: true }).filter({ visible: true });
    const reportName = role === "ADMIN" ? "Reports" : "Team reports";
    await Promise.all([
      page.waitForEvent("load"),
      workspace.getByRole("link", { name: reportName, exact: true }).click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`${home}/reports$`));
    if (compact) {
      await expect(page.getByRole("dialog")).toBeHidden();
      await trigger.click();
    }
    await expect(workspace.getByRole("link", { name: reportName, exact: true })).toHaveAttribute("aria-current", "page");
    if (compact) await page.keyboard.press("Escape");
    await expectNoPageOverflow(page);
    await capture(page, info, `${role.toLowerCase()}-reports-shell`);
    const account = page.locator('summary[aria-label="Profile and account"]');
    await account.click();
    await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
    await page.keyboard.press("Escape");
    await expectNoPageOverflow(page);
    await capture(page, info, `${role.toLowerCase()}-reports-shell-dark`);
    await account.click();
    await page.getByRole("button", { name: "View as learner", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await account.click();
    await page.getByRole("button", { name: `Switch to ${role.toLowerCase()}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${home}$`));
  });
}
