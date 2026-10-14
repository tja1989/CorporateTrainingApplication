import AxeBuilder from "@axe-core/playwright";
import { feedbackReportFixture } from "./feedback-report-fixtures";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  createPerson,
  signIn,
  withDb,
  expectNoPageOverflow,
  capture,
} from "./support";
import { enrollUser } from "../lib/lms/rules";
test("@core Completed employee submits and edits both feedback kinds; stale and foreign requests are protected", async ({
  page,
  browser,
}, info) => {
  const employee = await createPerson("LEARNER"),
    other = await createPerson("LEARNER"),
    trainer = await createPerson("INSTRUCTOR");
  const course = randomUUID(),
    module = randomUUID(),
    lesson = randomUUID(),
    title = "QA feedback " + course.slice(0, 8);
  await withDb(async (db) => {
    await db.query(
      "INSERT INTO courses(id,title,status,approval_state,instructor_id,department_id,certificate_enabled) VALUES($1,$2,'PUBLISHED','LEGACY_PUBLISHED',$3,$4,true)",
      [course, title, trainer.id, employee.departmentId],
    );
    await db.query(
      "INSERT INTO modules(id,course_id,title,sort) VALUES($1,$2,'QA feedback module',0)",
      [module, course],
    );
    await db.query(
      "INSERT INTO lessons(id,module_id,title,type,sort,payload) VALUES($1,$2,'QA feedback content','TEXT',0,$3)",
      [
        lesson,
        module,
        JSON.stringify({
          body: "Follow the procedure and ask for help when unsure.",
        }),
      ],
    );
  });
  await enrollUser(
    employee.id,
    { type: "course", id: course },
    "manual",
    null,
    null,
  );
  await signIn(page, employee);
  await page.goto(`/lesson/${lesson}`);
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await expect(
    page.getByText("Lesson complete", { exact: true }),
  ).toBeVisible();
  expect(
    await withDb(
      async (db) =>
        (
          await db.query(
            "SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",
            [employee.id, course],
          )
        ).rows[0].n,
    ),
  ).toBe(1);
  await page.goto(`/course/${course}`);
  await page
    .getByRole("link", { name: "Give course feedback", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Course and instructor feedback",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Training completed/)).toBeVisible();
  const content = page.getByRole("region", {
      name: "Course feedback",
      exact: true,
    }),
    instructor = page.getByRole("region", {
      name: "Instructor feedback",
      exact: true,
    });
  await expect(
    page.getByText(/Feedback is attributed to your account/),
  ).toBeVisible();
  await content
    .getByRole("radio", { name: "5 — Excellent", exact: true })
    .check();
  await content
    .getByLabel("Comment or suggestion", { exact: true })
    .fill("Clear examples\nمفيد");
  const request = page.waitForRequest(
    (req) => req.method() === "POST" && !!req.headers()["next-action"],
  );
  await content
    .getByRole("button", { name: "Save course feedback", exact: true })
    .click();
  const captured = await request;
  await expect(content.getByRole("status")).toContainText("Feedback saved");
  await instructor
    .getByRole("radio", { name: "4 — Very good", exact: true })
    .check();
  await instructor
    .getByLabel("Comment or suggestion", { exact: true })
    .fill("Patient explanation");
  await instructor
    .getByRole("button", { name: "Save instructor feedback", exact: true })
    .click();
  await expect(instructor.getByRole("status")).toContainText("Feedback saved");
  await page.reload();
  await expect(
    content.getByRole("radio", { name: "5 — Excellent", exact: true }),
  ).toBeChecked();
  await expect(
    instructor.getByRole("radio", { name: "4 — Very good", exact: true }),
  ).toBeChecked();
  const stale = await page.context().newPage();
  await stale.goto(page.url());
  await content.getByRole("radio", { name: "3 — Good", exact: true }).check();
  await content
    .getByLabel("Comment or suggestion", { exact: true })
    .fill("More practice please");
  await content
    .getByRole("button", { name: "Save course feedback", exact: true })
    .click();
  await expect(content.getByRole("status")).toContainText("3/5");
  const staleForm = stale.getByRole("region", {
    name: "Course feedback",
    exact: true,
  });
  await staleForm
    .getByLabel("Comment or suggestion", { exact: true })
    .fill("My retained suggestion");
  await staleForm
    .getByRole("button", { name: "Save course feedback", exact: true })
    .click();
  await expect(staleForm.getByRole("alert")).toContainText("another tab");
  await expect(
    staleForm.getByLabel("Comment or suggestion", { exact: true }),
  ).toHaveValue("My retained suggestion");
  await staleForm
    .getByRole("button", { name: "Load saved response", exact: true })
    .click();
  await expect(
    staleForm.getByLabel("Comment or suggestion", { exact: true }),
  ).toHaveValue("More practice please");
  await stale.close();
  await page.reload();
  await expect(
    content.getByRole("radio", { name: "3 — Good", exact: true }),
  ).toBeChecked();
  await withDb(async (db) => {
    const response = (
      await db.query(
        "SELECT * FROM course_feedback WHERE employee_id=$1 AND course_id=$2",
        [employee.id, course],
      )
    ).rows;
    expect(response).toHaveLength(1);
    expect(response[0].revision).toBe(2);
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM feedback_revisions WHERE kind='course' AND response_id=$1",
          [response[0].id],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.query(
          "SELECT instructor_id FROM instructor_feedback WHERE employee_id=$1 AND course_id=$2",
          [employee.id, course],
        )
      ).rows[0].instructor_id,
    ).toBe(trainer.id);
  });
  const foreignContext = await browser.newContext({
    baseURL: process.env.QA_BASE,
    ignoreHTTPSErrors: info.project.use.browserName !== "chromium",
  });
  try {
    const foreign = await foreignContext.newPage();
    await signIn(foreign, other);
    const result = await foreignContext.request.post(page.url(), {
      headers: {
        origin: new URL(page.url()).origin,
        "next-action": captured.headers()["next-action"],
        "content-type": captured.headers()["content-type"],
      },
      data: captured.postDataBuffer()!,
    });
    expect(await result.text()).toContain("own completed learning cycle");
    await foreign.goto(page.url());
    await expect(
      foreign.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
    await expect(foreign.getByText(title, { exact: true })).toHaveCount(0);
  } finally {
    await foreignContext.close();
  }
  await expectNoPageOverflow(page);
  await capture(page, info, "saved-course-instructor-feedback");
  await page.goto("/profile");
  await expect(
    page.getByRole("link", { name: "Edit your feedback", exact: true }).first(),
  ).toBeVisible();
  const certificate = await withDb(
    async (db) =>
      (
        await db.query(
          "SELECT id FROM certificates WHERE user_id=$1 AND course_id=$2",
          [employee.id, course],
        )
      ).rows[0].id,
  );
  await enrollUser(
    employee.id,
    { type: "course", id: course },
    "recert",
    certificate,
    new Date(Date.now() + 14 * 86400000),
  );
  await page.goto(`/course/${course}`);
  await expect(
    page.getByRole("link", {
      name: "Edit feedback for earlier completion",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: "Edit feedback for earlier completion",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Training completed/)).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Course feedback", exact: true })
      .getByRole("radio", { name: "3 — Good", exact: true }),
  ).toBeChecked();
});

for (const theme of ["light", "dark"] as const)
  test(`@core Feedback forms and report tables support keyboard and accessible ${theme} theme`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    await context.addCookies([
      { name: "ll_theme", value: theme, url: baseURL! },
    ]);
    const f = await feedbackReportFixture();
    const completion = await withDb(
      async (db) =>
        (
          await db.query(
            "SELECT completion_record_id FROM course_feedback WHERE employee_id=$1 AND course_id=$2",
            [f.employee.id, f.course],
          )
        ).rows[0].completion_record_id,
    );
    await signIn(page, f.employee);
    await page.goto(`/course/${f.course}/feedback?completionId=${completion}`);
    const form = page.getByRole("region", {
      name: "Course feedback",
      exact: true,
    });
    await expect(
      form.getByRole("button", { name: "Save course feedback", exact: true }),
    ).toBeEnabled();
    await form
      .getByRole("radio", { name: "5 — Excellent", exact: true })
      .focus();
    await page.keyboard.press("ArrowLeft");
    await expect(
      form.getByRole("radio", { name: "4 — Very good", exact: true }),
    ).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(
      form.getByLabel("Comment or suggestion", { exact: true }),
    ).toBeFocused();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await expectNoPageOverflow(page);
    await capture(page, info, `feedback-form-${theme}`);
    await context.clearCookies();
    await context.addCookies([
      { name: "ll_theme", value: theme, url: baseURL! },
    ]);
    await signIn(page, f.trainer);
    await page.goto(`/feedback?kind=course&period=month&courseId=${f.course}`);
    const table = page.getByRole("region", {
      name: "Feedback responses",
      exact: true,
    });
    await table.focus();
    await expect(table).toBeFocused();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await expectNoPageOverflow(page);
    await capture(page, info, `feedback-report-${theme}`);
  });
