import { test, expect } from "@playwright/test";
import { createPerson, signIn, expectNoPageOverflow, capture,withDb } from "./support";
import {totpCode} from "../lib/auth/totp";
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

test("@core Existing signed sessions follow role changes, renewed HR MFA and account reset revocation",async({page,browser},info)=>{
  const subject=await createPerson("ADMIN"),editor=await createPerson("ADMIN");await signIn(page,subject);
  const editorContext=await browser.newContext({baseURL:process.env.QA_BASE??"https://localhost:3444",ignoreHTTPSErrors:info.project.use.browserName!=="chromium"});
  try{
    const editorPage=await editorContext.newPage();await signIn(editorPage,editor);
    await editorPage.goto(`/admin/people?q=${subject.employeeId}`);
    async function changeRole(role:string){await editorPage.locator("main details summary").click();await editorPage.getByLabel("Role",{exact:true}).selectOption(role);await Promise.all([editorPage.waitForEvent("load"),editorPage.getByRole("button",{name:"Save",exact:true}).click()]);}
    await changeRole("LEARNER");
    expect((await page.request.get("/api/reports/engagement/csv")).status()).toBe(403);
    await page.goto("/admin/people");await expect(page).toHaveURL(/\/home$/);
    await changeRole("HR_HEAD");
    expect((await page.request.get("/api/reports/engagement/csv")).status()).toBe(403);
    await page.goto("/hr");await expect(page).toHaveURL(/\/login\/mfa$/);
    await page.getByLabel("Authenticator code",{exact:true}).fill(totpCode(subject.totpSecret!));await page.getByRole("button",{name:"Verify & continue",exact:true}).click();await expect(page).toHaveURL(/\/hr$/);
    expect((await page.request.get("/api/reports/engagement/csv")).status()).toBe(200);
    await editorPage.locator("main details summary").click();await editorPage.getByRole("button",{name:"Issue reset/activation code",exact:true}).click();await expect(editorPage.getByRole("region",{name:"Issued reset code",exact:true})).toBeVisible();
    expect((await page.request.get("/api/reports/engagement/csv")).status()).toBe(403);
    await page.goto("/hr");await expect(page).toHaveURL(/\/login$/);
  }finally{await editorContext.close();}
});

test("@core HR authenticator setup completes before its workspace or report API opens",async({page},info)=>{
  const person=await createPerson("HR_HEAD",{mfaSetup:true,privacy:0});await signIn(page,person);await expect(page).toHaveURL(/\/login\/mfa-setup$/);
  expect((await page.request.get("/api/reports/engagement/csv")).status()).toBe(403);
  const secret=(await page.getByLabel("Authenticator setup key",{exact:true}).textContent())!.trim();
  const valid=[-1,0,1].map(offset=>totpCode(secret,offset));const bad=["000000","111111","222222","333333"].find(value=>!valid.includes(value))!;
  await page.getByLabel("Code from your app",{exact:true}).fill(bad);await page.getByRole("button",{name:"Confirm & continue",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:/doesn’t match|doesn't match/})).toBeVisible();
  await page.getByLabel("Code from your app",{exact:true}).fill(totpCode(secret));await page.getByRole("button",{name:"Confirm & continue",exact:true}).click();await expect(page).toHaveURL(/\/privacy-notice$/);
  await page.getByRole("button",{name:/I understand/}).click();await expect(page).toHaveURL(/\/hr$/);await expectNoPageOverflow(page);await capture(page,info,"hr-setup-complete");
});

test("@core A Department Head without membership and an unknown imported role fail closed",async({page})=>{
  const head=await createPerson("DEPARTMENT_HEAD");await withDb(db=>db.query("UPDATE users SET department_id=NULL WHERE id=$1",[head.id]));await signIn(page,head);
  await expect(page.getByText(/Your account has no department/)).toBeVisible();
  for(const report of ["completion","compliance","transcript","cert_expiry","engagement","quiz_results"]){const result=await page.request.get(`/api/reports/${report}/csv`);expect(result.status()).toBe(200);expect((await result.text()).trim().split("\n")).toHaveLength(1);}
  await withDb(db=>db.query("UPDATE users SET role='UNSUPPORTED_EXTERNAL_ROLE' WHERE id=$1",[head.id]));
  expect((await page.request.get("/api/reports/engagement/csv")).status()).toBe(403);await page.goto("/department");await expect(page).toHaveURL(/\/login$/);
});
