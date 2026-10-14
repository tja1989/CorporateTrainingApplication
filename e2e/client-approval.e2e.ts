import { feedbackPeriod } from "../lib/feedback/periods";
import { runFeedbackDigests } from "../lib/feedback/digests";
import { DEFAULT_TZ } from "../lib/time";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import {
  createPerson,
  signIn,
  withDb,
  capture,
  expectNoPageOverflow,
} from "./support";
test("@core Instructor submits, Department Head rejects and approves, HR publishes and rolls out, Employee receives training", async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const department = randomUUID(),
    otherDepartment = randomUUID(),
    title = `QA approval ${randomUUID().slice(0, 8)}`;
  await withDb((db) =>
    db.query(
      "INSERT INTO departments(id,name) VALUES($1,'QA Approval Operations'),($2,'QA Unrelated Operations')",
      [department, otherDepartment],
    ),
  );
  const trainer = await createPerson("INSTRUCTOR", {
    departmentId: department,
    name: "QA Course Instructor",
  });
  const head = await createPerson("DEPARTMENT_HEAD", {
    departmentId: department,
    name: "QA Approval Head",
  });
  const hr = await createPerson("HR_HEAD", { name: "QA Publication HR" });
  const employee = await createPerson("LEARNER", {
    departmentId: department,
    name: "QA Assigned Employee",
  });
  const outsider = await createPerson("DEPARTMENT_HEAD", {
    departmentId: otherDepartment,
  });
  const otherInstructor = await createPerson("INSTRUCTOR", {
    departmentId: otherDepartment,
  });
  const contexts = await Promise.all(
    [trainer, head, hr, employee, outsider, otherInstructor].map(() =>
      browser.newContext({
        baseURL: process.env.QA_BASE ?? "https://localhost:3444",
        ignoreHTTPSErrors: info.project.use.browserName !== "chromium",
      }),
    ),
  );
  try {
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const [
      authorPage,
      headPage,
      hrPage,
      employeePage,
      outsiderPage,
      otherAuthorPage,
    ] = pages;
    await Promise.all(
      pages.map((page, index) =>
        signIn(
          page,
          [trainer, head, hr, employee, outsider, otherInstructor][index],
        ),
      ),
    );
    await authorPage.goto("/instructor/courses");
    await authorPage.getByLabel("Title", { exact: true }).fill(title);
    await authorPage
      .getByRole("button", { name: "Create draft", exact: true })
      .click();
    await authorPage.waitForURL(/\/instructor\/courses\/[^/?]+$/);
    const courseId = new URL(authorPage.url()).pathname.split("/").at(-1)!;
    await authorPage
      .getByLabel("New module title", { exact: true })
      .fill("Foundations");
    const moduleRequest = authorPage.waitForRequest(
      (req) => req.method() === "POST" && !!req.headers()["next-action"],
    );
    await authorPage
      .getByRole("button", { name: "Add module", exact: true })
      .click();
    const captured = await moduleRequest;
    const capturedBody = captured.postDataBuffer()!;
    const capturedHeaders = {
      origin: new URL(authorPage.url()).origin,
      "next-action": captured.headers()["next-action"],
      "content-type": captured.headers()["content-type"],
    };
    await expect(
      authorPage.getByRole("heading", { name: "Foundations", exact: true }),
    ).toBeVisible();
    const forged = await contexts[5].request.post(authorPage.url(), {
      headers: capturedHeaders,
      data: capturedBody,
    });
    expect(await forged.text()).toContain("You cannot edit this course.");
    async function addText(page: Page, lessonTitle: string, content: string) {
      await page
        .getByText("Add lesson to Foundations", { exact: true })
        .click();
      await page
        .getByLabel("Lesson type", { exact: true })
        .selectOption("TEXT");
      const addForm = page.locator("details").filter({
        has: page.locator("summary", {
          hasText: "Add lesson to Foundations",
        }),
      });
      await addForm
        .getByLabel("Lesson title", { exact: true })
        .fill(lessonTitle);
      await addForm.getByLabel("Lesson content", { exact: true }).fill(content);
      await page
        .getByRole("button", { name: "Add lesson", exact: true })
        .click();
      await expect(page.getByText(lessonTitle, { exact: true })).toBeVisible();
    }
    await addText(
      authorPage,
      "Safety essentials",
      "Verify the equipment and follow the safety procedure before work.",
    );
    await authorPage.goto(`/instructor/courses/${courseId}?view=settings`);
    await authorPage
      .getByLabel("Issue certificate on completion", { exact: true })
      .check();
    await Promise.all([
      authorPage.waitForEvent("load"),
      authorPage
        .getByRole("button", { name: "Save settings", exact: true })
        .click(),
    ]);
    await authorPage.goto(`/instructor/courses/${courseId}`);
    await authorPage
      .getByRole("region", { name: "Approval workflow" })
      .getByRole("button", { name: "Submit for approval", exact: true })
      .click();
    await expect(
      authorPage.getByText("Awaiting Department Head approval", {
        exact: true,
      }),
    ).toBeVisible();
    await headPage.goto(`/department/approvals/${courseId}`);
    await headPage.getByText("Review lesson content", { exact: true }).click();
    await expect(
      headPage.getByText(
        "Verify the equipment and follow the safety procedure before work.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      headPage.getByLabel("New module title", { exact: true }),
    ).toHaveCount(0);
    await headPage
      .getByLabel("Reason for rejection", { exact: true })
      .fill("   ");
    await headPage
      .getByRole("button", { name: "Reject with comments", exact: true })
      .click();
    await expect(
      headPage
        .getByRole("region", { name: "Approval workflow" })
        .getByRole("alert"),
    ).toContainText("Give a reason");
    const reason = "Add a practical safety checklist.";
    await headPage
      .getByLabel("Reason for rejection", { exact: true })
      .fill(reason);
    await headPage
      .getByRole("button", { name: "Reject with comments", exact: true })
      .click();
    await expect(
      headPage.getByText("Changes requested", { exact: true }),
    ).toBeVisible();
    await authorPage.reload();
    await authorPage.getByText(/Decision history/).click();
    await expect(authorPage.getByText(reason, { exact: true })).toBeVisible();
    const edit = authorPage
      .locator("details")
      .filter({
        has: authorPage.locator("summary", { hasText: "Edit lesson content" }),
      })
      .first();
    await edit.locator("summary").click();
    await edit
      .getByLabel("Lesson content", { exact: true })
      .fill("Corrected: verify the guard and emergency stop before work.");
    await edit
      .getByRole("button", { name: "Save lesson content", exact: true })
      .click();
    await expect
      .poll(async () =>
        withDb(
          async (db) =>
            (
              await db.query(
                "SELECT payload->>'body' body FROM lessons l JOIN modules m ON m.id=l.module_id WHERE m.course_id=$1 AND l.title='Safety essentials'",
                [courseId],
              )
            ).rows[0].body,
        ),
      )
      .toBe("Corrected: verify the guard and emergency stop before work.");
    await addText(
      authorPage,
      "Practical safety checklist",
      "Check the guard, confirm the emergency stop, and report faults before starting.",
    );
    await authorPage
      .getByRole("button", { name: "Submit for approval", exact: true })
      .click();
    await expect(
      authorPage.getByText("Awaiting Department Head approval", {
        exact: true,
      }),
    ).toBeVisible();
    await headPage.reload();
    await headPage
      .getByRole("button", { name: "Approve course", exact: true })
      .click();
    await expect(
      headPage.getByText("Approved for publication", { exact: true }),
    ).toBeVisible();
    await hrPage.goto(`/hr/courses/${courseId}`);
    await Promise.all([
      hrPage.waitForEvent("load"),
      hrPage
        .getByRole("button", { name: "Publish course", exact: true })
        .click(),
    ]);
    await expect(
      hrPage.getByText("Published · approved", { exact: true }),
    ).toBeVisible();
    await hrPage.reload();
    await expect(
      hrPage.getByText("Published · approved", { exact: true }),
    ).toBeVisible();
    await hrPage.goto("/hr/rollout");
    await hrPage
      .getByLabel("Training", { exact: true })
      .selectOption(`course:${courseId}`);
    await hrPage
      .getByLabel("Audience", { exact: true })
      .selectOption(`employee:${employee.id}`);
    await hrPage
      .getByRole("button", { name: "Assign training", exact: true })
      .click();
    await expect(
      hrPage
        .getByRole("region", { name: "Assign training" })
        .getByRole("status"),
    ).toContainText("1 new assignment");
    await hrPage
      .getByRole("button", { name: "Assign training", exact: true })
      .click();
    await expect(
      hrPage
        .getByRole("region", { name: "Assign training" })
        .getByRole("status"),
    ).toContainText("0 new assignments");
    await employeePage.goto(`/course/${courseId}`);
    await expect(
      employeePage.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await employeePage.goto("/inbox");
    await expect(
      employeePage.locator(`a[href='/course/${courseId}']`),
    ).toHaveCount(1);
    for (const [page, root, kind] of [
      [headPage, "department", "Course awaiting approval"],
      [hrPage, "hr", "Course approved"],
      [authorPage, "instructor", "Course needs changes"],
    ] as const) {
      await page.goto(`/${root}/inbox`);
      await expect(
        page.getByRole("heading", { name: kind, exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.locator(`a[href='/${root}/courses/${courseId}']`).first(),
      ).toBeVisible();
    }
    const denied = await outsiderPage.goto(`/department/courses/${courseId}`);
    await expect(
      outsiderPage.getByRole("heading", {
        name: "Page not found",
        exact: true,
      }),
    ).toBeVisible();
    expect(await denied!.text()).not.toContain(title);
    const csv = await contexts[4].request.get(
      `/api/reports/completion/csv?course=${encodeURIComponent(title)}`,
    );
    expect(csv.status()).toBe(200);
    expect(await csv.text()).not.toContain(title);
    const otherDenied = await otherAuthorPage.goto(
      `/instructor/courses/${courseId}`,
    );
    await expect(
      otherAuthorPage.getByRole("heading", {
        name: "Page not found",
        exact: true,
      }),
    ).toBeVisible();
    expect(await otherDenied!.text()).not.toContain(title);
    await withDb(async (db) => {
      const course = (
        await db.query(
          "SELECT status,approval_state,content_revision,approved_revision FROM courses WHERE id=$1",
          [courseId],
        )
      ).rows[0];
      expect(course.status).toBe("PUBLISHED");
      expect(course.approval_state).toBe("APPROVED");
      expect(course.approved_revision).toBe(course.content_revision);
      const events = (
        await db.query(
          "SELECT action,request_id FROM course_workflow_events WHERE course_id=$1 ORDER BY at",
          [courseId],
        )
      ).rows;
      expect(events.map((e) => e.action)).toEqual([
        "submit",
        "reject",
        "submit",
        "approve",
        "publish",
      ]);
      expect(new Set(events.map((e) => e.request_id)).size).toBe(5);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM modules WHERE course_id=$1",
            [courseId],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM enrollments WHERE user_id=$1 AND course_id=$2",
            [employee.id, courseId],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND kind='enrolled' AND payload->>'courseId'=$2",
            [employee.id, courseId],
          )
        ).rows[0].n,
      ).toBe(1);
    });
    await hrPage.goto(`/hr/courses/${courseId}`);
    await hrPage.getByText(/Decision history/).click();
    await expectNoPageOverflow(hrPage);
    await capture(hrPage, info, "approved-published-course");
    await hrPage
      .getByRole("button", { name: "Archive course", exact: true })
      .click();
    await expect
      .poll(async () =>
        withDb(
          async (db) =>
            (
              await db.query("SELECT status FROM courses WHERE id=$1", [
                courseId,
              ])
            ).rows[0].status,
        ),
      )
      .toBe("ARCHIVED");
    await employeePage.goto(`/course/${courseId}`);
    await expect(
      employeePage.getByRole("heading", {
        name: "Page not found",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await withDb(
        async (db) =>
          (
            await db.query(
              "SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=$2",
              [employee.id, courseId],
            )
          ).rows[0].n,
      ),
    ).toBe(1);
    await hrPage
      .getByRole("button", { name: "Restore and publish course", exact: true })
      .click();
    await expect(
      hrPage.getByText("Published · approved", { exact: true }),
    ).toBeVisible();
    await employeePage.goto(`/course/${courseId}`);
    await expect(
      employeePage.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(
      await withDb(
        async (db) =>
          (
            await db.query(
              "SELECT action FROM course_workflow_events WHERE course_id=$1 ORDER BY at DESC LIMIT 1",
              [courseId],
            )
          ).rows[0].action,
      ),
    ).toBe("publish");

    const lessons = await withDb(
      async (db) =>
        (
          await db.query(
            "SELECT l.id FROM lessons l JOIN modules m ON m.id=l.module_id WHERE m.course_id=$1 ORDER BY m.sort,l.sort",
            [courseId],
          )
        ).rows,
    );
    for (const lesson of lessons) {
      await employeePage.goto(`/lesson/${lesson.id}`);
      await employeePage
        .getByRole("button", { name: "Mark complete", exact: true })
        .click();
      await expect(
        employeePage.getByText("Lesson complete", { exact: true }),
      ).toBeVisible();
    }
    expect(
      await withDb(
        async (db) =>
          (
            await db.query(
              "SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",
              [employee.id, courseId],
            )
          ).rows[0].n,
      ),
    ).toBe(1);
    await employeePage.goto(`/course/${courseId}`);
    await employeePage
      .getByRole("link", { name: "Give course feedback", exact: true })
      .click();
    await expect(employeePage.getByText(/Training completed/)).toBeVisible();
    for (const [kind, rating, comment] of [
      ["Course", 4, "Useful approval-chain training"],
      ["Instructor", 5, "Clear teaching"],
    ] as const) {
      const form = employeePage.getByRole("region", {
        name: `${kind} feedback`,
        exact: true,
      });
      await form
        .getByRole("radio", {
          name: rating === 4 ? "4 — Very good" : "5 — Excellent",
          exact: true,
        })
        .check();
      await form
        .getByLabel("Comment or suggestion", { exact: true })
        .fill(comment);
      await form
        .getByRole("button", {
          name: `Save ${kind.toLowerCase()} feedback`,
          exact: true,
        })
        .click();
      await expect(form.getByRole("status")).toContainText("Feedback saved");
    }
    for (const page of [authorPage, headPage, hrPage]) {
      await page.goto(
        `/feedback?kind=course&period=month&courseId=${courseId}`,
      );
      await expect(page.getByTestId("feedback-response-count")).toHaveText("1");
      const csv = await page.request.get(
        `/api/feedback/reports/csv?kind=course&period=month&courseId=${courseId}`,
      );
      expect(csv.status()).toBe(200);
      expect(await csv.text()).toContain("Useful approval-chain training");
    }
    const futureTick = new Date(
      feedbackPeriod("month", new Date(), DEFAULT_TZ).end.getTime() + 1,
    );
    await runFeedbackDigests("month", futureTick);
    for (const [page, person, root] of [
      [authorPage, trainer, "instructor"],
      [headPage, head, "department"],
      [hrPage, hr, "hr"],
    ] as const) {
      const notification = await withDb(
        async (db) =>
          (
            await db.query(
              "SELECT payload FROM notifications WHERE user_id=$1 AND kind='course_feedback_digest' AND payload->>'period'=$2 ORDER BY sent_at DESC LIMIT 1",
              [
                person.id,
                feedbackPeriod("month", new Date(), DEFAULT_TZ).label,
              ],
            )
          ).rows[0],
      );
      expect(notification).toBeTruthy();
      if (person !== hr) expect(notification.payload.responses).toBe(1);
      await page.goto(`/${root}/inbox`);
      await expect(
        page
          .getByRole("heading", {
            name: "Monthly course feedback",
            exact: true,
          })
          .first(),
      ).toBeVisible();
      const link = page
        .locator(`a[href='${notification.payload.href}']`)
        .first();
      await expect(link).toBeVisible();
      await link.click();
      await expect(
        page.getByRole("heading", { name: "Feedback reports", exact: true }),
      ).toBeVisible();
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
