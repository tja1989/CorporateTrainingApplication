import { test, expect } from "@playwright/test";
import { createPerson, signIn, expectNoPageOverflow, capture } from "./support";
for (const [role, home, title] of [
  ["ADMIN", "/admin", "Overview"],
  ["HR_HEAD", "/hr", "HR workspace"],
  ["DEPARTMENT_HEAD", "/department", "Department workspace"],
  ["INSTRUCTOR", "/instructor", "Instructor workspace"],
  ["LEARNER", "/home", "Welcome"],
] as const) {
  test(`@core Five-role sign-in: ${role} has its permitted workspace`, async ({
    page,
  }, info) => {
    const person = await createPerson(role);
    await signIn(page, person);
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    if (role !== "ADMIN" && role !== "LEARNER")
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    await expectNoPageOverflow(page);
    if (role !== "LEARNER") {
      await page.getByLabel("Profile and account", { exact: true }).click();
      await page
        .getByRole("button", { name: "View as learner", exact: true })
        .click();
      await expect(page).toHaveURL(/\/home$/);
      const destination = {
        ADMIN: "Super Admin",
        HR_HEAD: "HR",
        DEPARTMENT_HEAD: "Department",
        INSTRUCTOR: "Instructor",
      }[role];
      await page.getByLabel("Profile and account", { exact: true }).click();
      await page
        .getByRole("button", { name: `Switch to ${destination}`, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${home}$`));
    }
    await capture(page, info, `role-${role.toLowerCase()}`);
  });
}
