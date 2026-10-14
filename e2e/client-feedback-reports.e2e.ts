import { test, expect } from "@playwright/test";
import { signIn, expectNoPageOverflow, capture } from "./support";
import { feedbackReportFixture } from "./feedback-report-fixtures";
test("@core Feedback pages and CSV preserve HR, department and delivered-instructor scopes", async ({
  page,
}, info) => {
  const f = await feedbackReportFixture();
  for (const [person, count, average] of [
    [f.hr, 2, "3.5"],
    [f.head, 1, "5"],
    [f.trainer, 1, "5"],
  ] as const) {
    await page.context().clearCookies();
    await signIn(page, person);
    for (const kind of ["course", "instructor"]) {
      const query = `kind=${kind}&period=month&courseId=${f.course}`;
      await page.goto(`/feedback?${query}`);
      await expect(
        page.getByRole("heading", { name: "Feedback reports", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("feedback-response-count")).toHaveText(
        String(count),
      );
      await expect(page.getByTestId("feedback-average")).toContainText(average);
      const result = await page.request.get(
        `/api/feedback/reports/csv?${query}&departmentId=FORGED_OTHER_DEPARTMENT`,
      );
      expect(result.status()).toBe(200);
      const csv = await result.text();
      expect(csv).toContain(f.title);
      if (person === f.hr) {
        expect(csv).toContain(f.employee.employeeId);
        expect(csv).toContain(f.foreign.employeeId);
      } else if (person === f.head && kind === "course") {
        expect(csv).toContain(f.employee.employeeId);
        expect(csv).not.toContain(f.foreign.employeeId);
      } else {
        expect(csv).not.toMatch(/PRIVATE|FOREIGN|Employee ID/);
        expect(csv).not.toContain(f.employee.employeeId);
        expect(csv).not.toContain(f.foreign.employeeId);
        if (person === f.head) expect(csv).not.toContain("Helpful examples");
      }
      await expectNoPageOverflow(page);
    }
    await capture(page, info, `feedback-reports-${person.role}`);
  }
  await page.goto(
    `/feedback?kind=course&period=month&courseId=${f.course}&instructorId=${f.otherTrainer.id}`,
  );
  await expect(page.getByTestId("feedback-response-count")).toHaveText("0");
  await expect(page.getByTestId("feedback-average")).toHaveText("No responses");
  await page.context().clearCookies();
  await signIn(page, f.employee);
  expect((await page.request.get("/api/feedback/reports/csv")).status()).toBe(
    403,
  );
});
