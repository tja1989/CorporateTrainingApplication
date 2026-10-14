import { test, expect } from "@playwright/test";
import { signIn, withDb, expectNoPageOverflow, capture } from "./support";
import { feedbackReportFixture } from "./feedback-report-fixtures";
test("@core HR moderation is audited, author sees saved state, and Instructor cannot replay it", async ({
  page,
  browser,
}, info) => {
  const f = await feedbackReportFixture();
  const response = await withDb(
    async (db) =>
      (
        await db.query(
          "SELECT id,completion_record_id FROM course_feedback WHERE employee_id=$1 AND course_id=$2",
          [f.employee.id, f.course],
        )
      ).rows[0],
  );
  await signIn(page, f.hr);
  await page.goto(`/feedback?kind=course&period=month&courseId=${f.course}`);
  const panel = page.getByRole("region", {
    name: "Feedback moderation",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const item = panel.getByTestId(`moderation-${response.id}`);
  await item.locator("summary").click();
  await item.getByLabel("Hide comment from reports", { exact: true }).check();
  await item.getByLabel("Moderation reason", { exact: true }).fill("   ");
  await item
    .getByRole("button", { name: "Save moderation", exact: true })
    .click();
  await expect(item.getByRole("alert")).toContainText("reason");
  await item
    .getByLabel("Moderation reason", { exact: true })
    .fill("Protect personal details");
  const request = page.waitForRequest(
    (req) => req.method() === "POST" && !!req.headers()["next-action"],
  );
  await item
    .getByRole("button", { name: "Save moderation", exact: true })
    .click();
  const captured = await request;
  await expect
    .poll(async () =>
      withDb(
        async (db) =>
          (
            await db.query("SELECT revision FROM course_feedback WHERE id=$1", [
              response.id,
            ])
          ).rows[0].revision,
      ),
    )
    .toBe(2);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Feedback responses", exact: true }),
  ).not.toContainText("Helpful examples");
  await expect(page.getByTestId("feedback-response-count")).toHaveText("2");
  const context = await browser.newContext({
    baseURL: process.env.QA_BASE,
    ignoreHTTPSErrors: info.project.use.browserName !== "chromium",
  });
  try {
    const employee = await context.newPage();
    await signIn(employee, f.employee);
    await employee.goto(
      `/course/${f.course}/feedback?completionId=${response.completion_record_id}`,
    );
    await expect(employee.getByText(/Your comment is hidden/)).toBeVisible();
    await expect(
      employee
        .getByRole("region", { name: "Course feedback", exact: true })
        .getByLabel("Comment or suggestion", { exact: true }),
    ).toHaveValue("Helpful examples");
    await expectNoPageOverflow(employee);
    await capture(employee, info, "author-moderation-state");
    await context.clearCookies();
    await signIn(employee, f.trainer);
    const forged = await context.request.post(page.url(), {
      headers: {
        origin: new URL(page.url()).origin,
        "next-action": captured.headers()["next-action"],
        "content-type": captured.headers()["content-type"],
      },
      data: captured.postDataBuffer()!,
    });
    expect(await forged.text()).toContain("Not authorized to moderate");
    await employee.goto(
      `/feedback?kind=course&period=month&courseId=${f.course}`,
    );
    await expect(
      employee.getByRole("region", {
        name: "Feedback moderation",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      employee.getByRole("region", { name: "Feedback responses", exact: true }),
    ).not.toContainText("Helpful examples");
    await context.clearCookies();
    await signIn(employee, f.head);
    const headForged = await context.request.post(page.url(), {
      headers: {
        origin: new URL(page.url()).origin,
        "next-action": captured.headers()["next-action"],
        "content-type": captured.headers()["content-type"],
      },
      data: captured.postDataBuffer()!,
    });
    expect(await headForged.text()).toContain("Not authorized to moderate");
  } finally {
    await context.close();
  }
  await page
    .getByRole("region", { name: "Feedback moderation", exact: true })
    .getByTestId(`moderation-${response.id}`)
    .locator("summary")
    .click();
  const updated = page.getByTestId(`moderation-${response.id}`);
  await updated
    .getByLabel("Exclude invalid response from ratings", { exact: true })
    .check();
  await updated
    .getByLabel("Moderation reason", { exact: true })
    .fill("Invalid response");
  await updated
    .getByRole("button", { name: "Save moderation", exact: true })
    .click();
  await expect
    .poll(async () =>
      withDb(
        async (db) =>
          (
            await db.query("SELECT revision FROM course_feedback WHERE id=$1", [
              response.id,
            ])
          ).rows[0].revision,
      ),
    )
    .toBe(3);
  await page.reload();
  await expect(page.getByTestId("feedback-response-count")).toHaveText("1");
  const audit = await withDb(
    async (db) =>
      (
        await db.query(
          "SELECT action,reason FROM feedback_revisions WHERE kind='course' AND response_id=$1 ORDER BY revision",
          [response.id],
        )
      ).rows,
  );
  expect(audit.map((r) => r.action)).toEqual([
    "create",
    "moderate",
    "moderate",
  ]);
  expect(audit[1].reason).toBe("Protect personal details");
  expect(audit[2].reason).toBe("Invalid response");
  await expectNoPageOverflow(page);
});
