import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import {
  createPerson,
  signIn,
  withDb,
  capture,
  expectNoPageOverflow,
} from "./support";
import { enrollUser } from "../lib/lms/rules";
import { DEFAULT_SETTINGS } from "../lib/quiz/engine";

async function courseFixture(
  instructorId: string,
  departmentId: string | null,
  title: string,
  status = "PUBLISHED",
  folderPath = "",
  startsAt: string | null = null,
  endsAt: string | null = null,
) {
  const id = randomUUID(),
    module = randomUUID(),
    lesson = randomUUID();
  await withDb(async (db) => {
    await db.query(
      "INSERT INTO courses(id,title,status,approval_state,instructor_id,created_by,department_id,certificate_enabled,folder_path,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$5,$6,true,$7,$8,$9)",
      [
        id,
        title,
        status,
        status === "DRAFT" ? "DRAFT" : "LEGACY_PUBLISHED",
        instructorId,
        departmentId,
        folderPath,
        startsAt,
        endsAt,
      ],
    );
    await db.query(
      "INSERT INTO modules(id,course_id,title,sort) VALUES($1,$2,'Learning chapter',0)",
      [module, id],
    );
    await db.query(
      "INSERT INTO lessons(id,module_id,title,type,sort,payload) VALUES($1,$2,'Read the procedure','TEXT',0,$3)",
      [
        lesson,
        module,
        JSON.stringify({
          body: "Read the procedure carefully, check your work and ask your supervisor for help when you are unsure.",
        }),
      ],
    );
  });
  return { id, module, lesson, title };
}
async function clickReload(page: Page, name: string) {
  await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name, exact: true }).click(),
  ]);
}
test("@core Author planning survives approval, future rollout, prerequisite unlock and late completion", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const head = await createPerson("DEPARTMENT_HEAD"),
    instructor = await createPerson("INSTRUCTOR", {
      departmentId: head.departmentId!,
    }),
    hr = await createPerson("HR_HEAD"),
    employee = await createPerson("LEARNER", {
      departmentId: head.departmentId!,
    });
  const token = randomUUID().slice(0, 8),
    required = await courseFixture(
      instructor.id,
      head.departmentId,
      `Required ${token}`,
    ),
    target = await courseFixture(
      instructor.id,
      head.departmentId,
      `Planning ${token}`,
      "DRAFT",
    );
  const contexts = await Promise.all(
    [hr, head, employee].map(() =>
      browser.newContext({
        baseURL: process.env.QA_BASE,
        viewport: info.project.use.viewport,
        hasTouch: info.project.use.hasTouch,
        ignoreHTTPSErrors: info.project.use.browserName !== "chromium",
      }),
    ),
  );
  const [hrPage, headPage, employeePage] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  try {
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${target.id}?view=settings`);
    await page
      .getByLabel("Course start date", { exact: true })
      .fill("2031-10-20");
    await page
      .getByLabel("Course end date", { exact: true })
      .fill("2031-10-19");
    await page
      .getByLabel("Course folder", { exact: true })
      .fill(`Planning ${token}/Safety/Food`);
    await page
      .getByLabel("Add prerequisite course", { exact: true })
      .selectOption(required.id);
    await page
      .getByRole("button", { name: "Add prerequisite", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "end date" }),
    ).toBeVisible();
    await expect(page.getByLabel("Course folder", { exact: true })).toHaveValue(
      `Planning ${token}/Safety/Food`,
    );
    await page
      .getByLabel("Course end date", { exact: true })
      .fill("2031-10-22");
    await clickReload(page, "Save settings");
    await expect(page.getByText(required.title, { exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, info, "planned-course-author-settings");
    await clickReload(page, "Submit for approval");
    await signIn(headPage, head);
    await headPage.goto(`/department/courses/${target.id}?view=settings`);
    await expect(
      headPage.getByLabel("Course start date", { exact: true }),
    ).toHaveValue("2031-10-20");
    await expect(
      headPage.getByText(required.title, { exact: true }),
    ).toBeVisible();
    await clickReload(headPage, "Approve course");
    await signIn(hrPage, hr);
    await hrPage.goto(`/hr/courses/${target.id}`);
    await clickReload(hrPage, "Publish course");
    await hrPage.goto("/hr/rollout");
    await hrPage
      .getByLabel("Training", { exact: true })
      .selectOption(`course:${target.id}`);
    await hrPage
      .getByLabel("Audience", { exact: true })
      .selectOption(`employee:${employee.id}`);
    await hrPage.getByLabel("Use course end dates", { exact: true }).check();
    await hrPage
      .getByRole("button", { name: "Assign training", exact: true })
      .click();
    await expect(
      hrPage.getByRole("status").filter({ hasText: "1 new assignment" }),
    ).toBeVisible();
    const enrollment = await withDb(
      async (db) =>
        (
          await db.query(
            "SELECT * FROM enrollments WHERE user_id=$1 AND course_id=$2",
            [employee.id, target.id],
          )
        ).rows[0],
    );
    expect(enrollment.due_at.toISOString()).toBe("2031-10-22T19:59:59.000Z");
    await signIn(employeePage, employee);
    await employeePage.goto("/learn?view=upcoming");
    await expect(
      employeePage.getByRole("heading", { name: target.title, exact: true }),
    ).toBeVisible();
    await employeePage.locator(`a[href='/course/${target.id}']`).click();
    await expect(employeePage.getByText(/This course opens/)).toBeVisible();
    await expect(
      employeePage.getByText("Enrollment date", { exact: true }),
    ).toBeVisible();
    await expect(employeePage.getByTestId("enrollment-date")).toHaveAttribute(
      "datetime",
      enrollment.created_at.toISOString(),
    );
    await expect(
      employeePage.getByRole("link", { name: "Start course", exact: true }),
    ).toHaveCount(0);
    await capture(employeePage, info, "planned-course-scheduled");
    await employeePage.goto(`/lesson/${target.lesson}`);
    await expect(employeePage.getByText(/This course opens/)).toBeVisible();
    await expect(
      employeePage.getByRole("button", { name: "Mark complete", exact: true }),
    ).toHaveCount(0);
    await employeePage.goto("/home");
    await expect(
      employeePage.getByRole("link", { name: "Continue lesson", exact: true }),
    ).toHaveCount(0);
    // Change the real published revision through the approved author/review/publish workflow.
    await page.goto(`/instructor/courses/${target.id}`);
    await clickReload(page, "Revise published course");
    await page.goto(`/instructor/courses/${target.id}?view=settings`);
    await page
      .getByLabel("Course start date", { exact: true })
      .fill("2020-01-01");
    await page
      .getByLabel("Course end date", { exact: true })
      .fill("2020-01-02");
    await clickReload(page, "Save settings");
    await clickReload(page, "Submit for approval");
    await headPage.goto(`/department/courses/${target.id}`);
    await clickReload(headPage, "Approve course");
    await hrPage.goto(`/hr/courses/${target.id}`);
    await clickReload(hrPage, "Publish course");
    await employeePage.goto(`/course/${target.id}`);
    await expect(
      employeePage.getByText(/Complete the required prerequisite/),
    ).toBeVisible();
    // The target alone was assigned. Follow its prerequisite through normal learning.
    await employeePage.goto(`/lesson/${required.lesson}`);
    await employeePage
      .getByRole("button", { name: "Mark complete", exact: true })
      .click();
    await employeePage.waitForURL(`/lesson/${required.lesson}?completed=1`);
    await employeePage.goto(`/course/${target.id}`);
    await expect(
      employeePage.getByRole("link", { name: "Start course", exact: true }),
    ).toBeVisible();
    await employeePage.goto(`/lesson/${target.lesson}`);
    await employeePage
      .getByRole("button", { name: "Mark complete", exact: true })
      .click();
    await employeePage.waitForURL(`/lesson/${target.lesson}?completed=1`);
    expect(
      await withDb(
        async (db) =>
          (
            await db.query(
              "SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",
              [employee.id, target.id],
            )
          ).rows[0].n,
      ),
    ).toBe(1);
    expect(
      (
        await withDb(
          async (db) =>
            (
              await db.query("SELECT due_at FROM enrollments WHERE id=$1", [
                enrollment.id,
              ])
            ).rows[0].due_at,
        )
      ).toISOString(),
    ).toBe(enrollment.due_at.toISOString());
    await employeePage.goto(`/course/${target.id}`);
    await expect(
      employeePage.getByRole("link", {
        name: "Give course feedback",
        exact: true,
      }),
    ).toBeVisible();
    await expectNoPageOverflow(employeePage);
    await capture(employeePage, info, "planned-course-completed");
    // Model a later scheduled cycle without rewriting immutable completion evidence.
    await withDb((db) =>
      db.query(
        "UPDATE courses SET starts_at='2031-10-20',ends_at='2031-10-22' WHERE id=$1",
        [target.id],
      ),
    );
    await employeePage.reload();
    await expect(employeePage.getByText(/This course opens/)).toBeVisible();
    const historicalFeedback = employeePage.getByRole("link", {
      name: "Feedback for earlier completion",
      exact: true,
    });
    await expect(historicalFeedback).toBeVisible();
    const certificateHref = await employeePage
      .getByRole("link", { name: "Download certificate", exact: true })
      .getAttribute("href");
    const certificateResponse = await employeePage.request.get(
      certificateHref!,
    );
    expect(certificateResponse.status()).toBe(200);
    expect(certificateResponse.headers()["content-type"]).toContain(
      "application/pdf",
    );
    await historicalFeedback.click();
    await expect(
      employeePage.getByRole("heading", {
        name: "Course and instructor feedback",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("@core Folder navigation includes descendants, excludes sibling prefixes and preserves Back", async ({
  page,
}, info) => {
  const employee = await createPerson("LEARNER"),
    instructor = await createPerson("INSTRUCTOR"),
    root = `Folders ${randomUUID().slice(0, 8)} · صحة & Food?`;
  const inside = await courseFixture(
      instructor.id,
      null,
      "Inside " + root,
      "PUBLISHED",
      root + "/Safety/Food",
    ),
    sibling = await courseFixture(
      instructor.id,
      null,
      "Sibling " + root,
      "PUBLISHED",
      root + "/Safetyware",
    );
  await enrollUser(
    employee.id,
    { type: "course", id: inside.id },
    "manual",
    null,
    null,
  );
  await enrollUser(
    employee.id,
    { type: "course", id: sibling.id },
    "manual",
    null,
    null,
  );
  await signIn(page, employee);
  await page.goto(`/learn?view=mine&folder=${encodeURIComponent(root)}`);
  await page.emulateMedia({ colorScheme: "dark" });
  await page
    .getByRole("link", { name: "Safety · 1 course", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(inside.title, { exact: true })).toBeVisible();
  await expect(page.getByText(sibling.title, { exact: true })).toHaveCount(0);
  await page
    .getByRole("link", { name: "Food · 1 course", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("folder=.*Safety.*Food"));
  await page.goBack();
  await expect(
    page.getByRole("link", { name: "Food · 1 course", exact: true }),
  ).toBeVisible();
  await expectNoPageOverflow(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await capture(page, info, "nested-course-folders");
});

test("@core Planning gates protect real video, quiz and oral HTTP writes and retain ownership checks", async ({
  page,
}) => {
  const employee = await createPerson("LEARNER"),
    other = await createPerson("LEARNER"),
    instructor = await createPerson("INSTRUCTOR");
  const course = await courseFixture(
    instructor.id,
    null,
    `HTTP planning ${randomUUID().slice(0, 8)}`,
    "PUBLISHED",
    "",
    "2031-10-20",
    "2031-10-22",
  );
  const video = randomUUID(),
    videoLesson = randomUUID(),
    quiz = randomUUID(),
    quizLesson = randomUUID(),
    bank = randomUUID(),
    question = randomUUID(),
    attempt = randomUUID(),
    foreignAttempt = randomUUID(),
    oral = randomUUID(),
    interview = randomUUID(),
    foreignInterview = randomUUID();
  await withDb(async (db) => {
    await db.query("UPDATE courses SET sequential_lock=false WHERE id=$1", [
      course.id,
    ]);
    await db.query(
      "INSERT INTO videos(id,youtube_id,title,duration_sec) VALUES($1,$2,'Planning video',60)",
      [video, video],
    );
    await db.query(
      "INSERT INTO lessons(id,module_id,title,type,sort,payload) VALUES($1,$2,'Planning video','VIDEO',1,$3),($4,$2,'Planning quiz','QUIZ',2,$5),($6,$2,'Planning oral check','INTERVIEW',3,$7)",
      [
        videoLesson,
        course.module,
        JSON.stringify({ videoId: video }),
        quizLesson,
        JSON.stringify({ quizId: quiz }),
        oral,
        JSON.stringify({
          interview: {
            questionCount: 1,
            maxMinutes: 3,
            passPct: 67,
            requirePass: true,
            scope: "course",
          },
        }),
      ],
    );
    await db.query(
      "INSERT INTO question_banks(id,name,course_id) VALUES($1,'HTTP planning bank',$2)",
      [bank, course.id],
    );
    await db.query(
      "INSERT INTO questions(id,bank_id,type,status,body) VALUES($1,$2,'truefalse','APPROVED',$3)",
      [
        question,
        bank,
        JSON.stringify({ prompt: "Follow the procedure?", correct: [0] }),
      ],
    );
    await db.query(
      "INSERT INTO quizzes(id,lesson_id,title,settings,sections) VALUES($1,$2,'HTTP planning quiz',$3,$4)",
      [
        quiz,
        quizLesson,
        JSON.stringify(DEFAULT_SETTINGS),
        JSON.stringify([{ fixed: [question] }]),
      ],
    );
    for (const [id, user] of [
      [attempt, employee.id],
      [foreignAttempt, other.id],
    ])
      await db.query(
        "INSERT INTO attempts(id,quiz_id,user_id,served_items,answers,state) VALUES($1,$2,$3,$4,'{}','IN_PROGRESS')",
        [id, quiz, user, JSON.stringify([{ questionId: question, order: 0 }])],
      );
    for (const [id, user] of [
      [interview, employee.id],
      [foreignInterview, other.id],
    ])
      await db.query(
        "INSERT INTO live_interviews(id,user_id,lesson_id,course_id,model,mock) VALUES($1,$2,$3,$4,'offline',true)",
        [id, user, oral, course.id],
      );
  });
  await enrollUser(
    employee.id,
    { type: "course", id: course.id },
    "manual",
    null,
    null,
  );
  await signIn(page, employee);
  const request = page.request,
    answers = { [question]: { kind: "choice", selected: [0] } };
  expect(
    (
      await request.post("/api/progress", {
        data: { lessonId: videoLesson, positionSec: 10 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/tutor", {
        data: {
          lessonId: videoLesson,
          message: "Explain the procedure",
          scope: "course",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    await withDb(
      async (db) =>
        (
          await db.query(
            "SELECT count(*)::int n FROM tutor_threads WHERE user_id=$1",
            [employee.id],
          )
        ).rows[0].n,
    ),
  ).toBe(0);
  expect((await request.post(`/api/quiz/${quiz}/start`)).status()).toBe(403);
  expect(
    (
      await request.patch(`/api/attempt/${attempt}`, { data: { answers } })
    ).status(),
  ).toBe(409);
  expect((await request.post(`/api/attempt/${attempt}`)).status()).toBe(403);
  expect(
    (
      await request.patch(`/api/attempt/${foreignAttempt}`, {
        data: { answers },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post("/api/live/interview/session", {
        data: { lessonId: oral },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/live/interview/event", {
        data: {
          interviewId: interview,
          type: "mock_evaluate",
          qa: [
            {
              question: "What now?",
              answer:
                "Read the procedure carefully and ask the supervisor for help.",
            },
          ],
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/live/interview/event", {
        data: { interviewId: foreignInterview, type: "end" },
      })
    ).status(),
  ).toBe(404);
  const ended = await request.post("/api/live/interview/event", {
    data: { interviewId: interview, type: "end" },
  });
  expect(ended.status()).toBe(200);
  expect((await ended.json()).state).toBe("ABANDONED");
  const blocked = await withDb(async (db) => ({
    progress: (
      await db.query(
        "SELECT count(*)::int n FROM lesson_progress WHERE user_id=$1",
        [employee.id],
      )
    ).rows[0].n,
    attempt: (
      await db.query("SELECT state,answers FROM attempts WHERE id=$1", [
        attempt,
      ])
    ).rows[0],
    certificates: (
      await db.query(
        "SELECT count(*)::int n FROM certificates WHERE user_id=$1",
        [employee.id],
      )
    ).rows[0].n,
  }));
  expect(blocked).toEqual({
    progress: 0,
    attempt: { state: "IN_PROGRESS", answers: {} },
    certificates: 0,
  });
  // Controlled server-side fixture opening, independently from the real author workflow above.
  await withDb((db) =>
    db.query(
      "UPDATE courses SET starts_at='2020-01-01',ends_at='2020-01-02' WHERE id=$1",
      [course.id],
    ),
  );
  expect(
    (
      await request.post("/api/progress", {
        data: { lessonId: videoLesson, positionSec: 10 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.patch(`/api/attempt/${attempt}`, { data: { answers } })
    ).status(),
  ).toBe(200);
  expect((await request.post(`/api/attempt/${attempt}`)).status()).toBe(200);
  const started = await request.post("/api/live/interview/session", {
    data: { lessonId: oral },
  });
  expect(started.status()).toBe(200);
  const session = await started.json();
  expect(session.mock).toBe(true);
  expect(
    (
      await request.post("/api/live/interview/event", {
        data: { interviewId: session.interviewId, type: "end" },
      })
    ).status(),
  ).toBe(200);
});

test("@core An overdue course-end assignment still completes and awards its certificate", async ({
  page,
}, info) => {
  const employee = await createPerson("LEARNER"),
    instructor = await createPerson("INSTRUCTOR");
  const course = await courseFixture(
    instructor.id,
    null,
    `Overdue planning ${randomUUID().slice(0, 8)}`,
    "PUBLISHED",
    "",
    "2020-01-01",
    "2020-01-02",
  );
  await enrollUser(
    employee.id,
    { type: "course", id: course.id },
    "manual",
    null,
    null,
  );
  expect(
    await withDb(
      async (db) =>
        (
          await db.query(
            "SELECT compliance_status FROM enrollments WHERE user_id=$1 AND course_id=$2",
            [employee.id, course.id],
          )
        ).rows[0].compliance_status,
    ),
  ).toBe("OVERDUE");
  await signIn(page, employee);
  await page.goto(`/lesson/${course.lesson}`);
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await page.waitForURL(`/lesson/${course.lesson}?completed=1`);
  await page.goto(`/course/${course.id}`);
  await expect(
    page.getByRole("link", { name: "Give course feedback", exact: true }),
  ).toBeVisible();
  expect(
    await withDb(
      async (db) =>
        (
          await db.query(
            "SELECT count(*)::int n FROM certificates WHERE user_id=$1 AND course_id=$2",
            [employee.id, course.id],
          )
        ).rows[0].n,
    ),
  ).toBe(1);
  await expectNoPageOverflow(page);
  await capture(page, info, "overdue-planning-completed");
});

for (const ordered of [true, false]) {
  test(`@core Planning-aware ${ordered ? "ordered" : "unordered"} path continuation`, async ({
    page,
  }) => {
    const employee = await createPerson("LEARNER"),
      instructor = await createPerson("INSTRUCTOR");
    const future = await courseFixture(
      instructor.id,
      null,
      `Future path ${randomUUID().slice(0, 8)}`,
      "PUBLISHED",
      "",
      "2031-10-20",
      "2031-10-22",
    );
    const ready = await courseFixture(
      instructor.id,
      null,
      `Ready path ${randomUUID().slice(0, 8)}`,
    );
    const path = randomUUID();
    await withDb(async (db) => {
      await db.query(
        "INSERT INTO paths(id,title,complete_in_order) VALUES($1,'Planning-aware path',$2)",
        [path, ordered],
      );
      for (const [index, course] of [future, ready].entries())
        await db.query(
          "INSERT INTO path_courses(id,path_id,course_id,sort) VALUES($1,$2,$3,$4)",
          [randomUUID(), path, course.id, index],
        );
    });
    await enrollUser(
      employee.id,
      { type: "path", id: path },
      "manual",
      null,
      null,
    );
    await signIn(page, employee);
    await page.goto(`/path/${path}`);
    if (ordered) {
      await expect(
        page.getByRole("link", { name: "Continue path", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByText("Scheduled", { exact: true })).toBeVisible();
    } else
      await expect(
        page.getByRole("link", { name: "Continue path", exact: true }),
      ).toHaveAttribute("href", `/lesson/${ready.lesson}`);
    await expectNoPageOverflow(page);
  });
}

test("@core Course-wide lesson gate offers availability instead of a self-link", async ({
  page,
}) => {
  const employee = await createPerson("LEARNER"),
    instructor = await createPerson("INSTRUCTOR");
  const future = await courseFixture(
    instructor.id,
    null,
    `Future lesson ${randomUUID().slice(0, 8)}`,
    "PUBLISHED",
    "",
    "2031-10-20",
    "2031-10-22",
  );
  await signIn(page, employee);
  await page.goto(`/lesson/${future.lesson}`);
  await expect(
    page.getByRole("link", { name: "View course availability", exact: true }),
  ).toHaveAttribute("href", `/course/${future.id}`);
  await expect(
    page.locator(`main a[href='/lesson/${future.lesson}']`),
  ).toHaveCount(0);
});

test("@core Availability explanation fits the first viewport before metadata", async ({
  page,
}, info) => {
  const employee = await createPerson("LEARNER"),
    instructor = await createPerson("INSTRUCTOR");
  const future = await courseFixture(
    instructor.id,
    null,
    `Scheduled course ${randomUUID().slice(0, 8)}`,
    "PUBLISHED",
    "Operations/Safety/Food",
    "2031-10-20",
    "2031-10-22",
  );
  await enrollUser(
    employee.id,
    { type: "course", id: future.id },
    "manual",
    null,
    null,
  );
  await signIn(page, employee);
  await page.goto(`/course/${future.id}`);
  const gate = page.getByRole("region", {
    name: "Training availability",
    exact: true,
  });
  const box = await gate.boundingBox(),
    summary = await page
      .getByRole("region", { name: "Course schedule", exact: true })
      .boundingBox();
  expect(box!.y).toBeLessThan(summary!.y);
  expect(box!.y + box!.height).toBeLessThan(
    (await page.evaluate(() => innerHeight)) - 80,
  );
  await capture(page, info, "availability-first-viewport");
});

test("@core Undated course metadata does not promise availability", async ({
  page,
}) => {
  const employee = await createPerson("LEARNER"),
    instructor = await createPerson("INSTRUCTOR");
  const course = await courseFixture(
    instructor.id,
    null,
    `Undated course ${randomUUID().slice(0, 8)}`,
  );
  await signIn(page, employee);
  await page.goto(`/course/${course.id}`);
  await expect(page.getByText("Available now", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("No start date set", { exact: true }),
  ).toBeVisible();
});
