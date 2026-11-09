import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const m = vi.hoisted(() => ({
  user: { id: "u1", role: "INSTRUCTOR", timeMultiplier: 1 } as { id: string; role: string; timeMultiplier: number },
  preview: null as unknown,
  rows: [] as unknown[],
}));

vi.mock("@/lib/auth/guard", () => ({ requireUser: async () => m.user }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  usePathname: () => "/preview",
}));
vi.mock("@/lib/preview/course", async (orig) => ({ ...(await orig<typeof import("@/lib/preview/course")>()), loadPreviewCourse: async () => m.preview }));
vi.mock("@/lib/db/client", async () => {
  const schema = await import("../lib/db/schema");
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => m.rows;
  return { t: schema, db: { select: () => chain } };
});

import { decorateOutline } from "../lib/lms/outline";
import CoursePreviewPage from "../app/(preview)/preview/course/[courseId]/page";
import LessonPreviewPage from "../app/(preview)/preview/course/[courseId]/lesson/[lessonId]/page";
import PreviewLayout from "../app/(preview)/layout";

const lessons = [
  { id: "l1", moduleId: "m1", type: "TEXT", title: "Intro", sort: 0, payload: { body: "Hello **there**" } },
  { id: "l2", moduleId: "m1", type: "INTERVIEW", title: "Oral check", sort: 1, payload: { interview: { questionCount: 3, passPct: 70, maxMinutes: 6, scope: "module", requirePass: true } } },
  { id: "l3", moduleId: "m1", type: "QUIZ", title: "Final quiz", sort: 2, payload: { quizId: "q1" } },
] as const;

function fixture(over: { sequentialLock?: boolean; startsAt?: Date | null; prerequisites?: { title: string }[]; empty?: boolean } = {}) {
  const used = over.empty ? [] : lessons;
  const course = { id: "c1", title: "Food safety", description: "Keep food safe.", coverUrl: null, tags: [], objectives: [], estMinutes: 20, language: "en", sequentialLock: over.sequentialLock ?? false, startsAt: over.startsAt ?? null };
  const view = decorateOutline({
    courseId: "c1",
    modules: [{ id: "m1", title: "Basics", sort: 0 }],
    lessons: used.map((l) => ({ ...l })),
    doneLessonIds: [],
    sequentialLock: false,
    hrefFor: (id) => `/preview/course/c1/lesson/${id}`,
  });
  m.preview = { course, view, lessons: used.map((l) => ({ ...l })), modules: [{ id: "m1", title: "Basics", sort: 0 }], prerequisites: over.prerequisites ?? [], backHref: "/instructor/courses/c1" };
}

const lessonPage = async (lessonId: string) =>
  renderToStaticMarkup(await LessonPreviewPage({ params: Promise.resolve({ courseId: "c1", lessonId }) }));

beforeEach(() => {
  m.user = { id: "u1", role: "INSTRUCTOR", timeMultiplier: 1 };
  m.rows = [{ id: "q1", lessonId: "l3", settings: { timeLimitSec: 600, attemptsLimit: 2, passPct: 80 } }];
  fixture();
});

describe("preview pages", () => {
  it("opens every page with the banner and a way back", async () => {
    const html = renderToStaticMarkup(await CoursePreviewPage({ params: Promise.resolve({ courseId: "c1" }) }));
    expect(html).toContain("Preview — nothing is saved");
    expect(html).toMatch(/href="\/instructor\/courses\/c1"[^>]*>Back to editor/);
    expect(await lessonPage("l1")).toContain("Preview — nothing is saved");
  });

  it("returns not found for an unknown course or a lesson outside it", async () => {
    await expect(lessonPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    m.preview = null;
    await expect(CoursePreviewPage({ params: Promise.resolve({ courseId: "c1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the learner notes on the overview", async () => {
    fixture({ sequentialLock: true, startsAt: new Date(Date.now() + 5 * 864e5), prerequisites: [{ title: "Hygiene 101" }, { title: "Allergens" }] });
    const html = renderToStaticMarkup(await CoursePreviewPage({ params: Promise.resolve({ courseId: "c1" }) }));
    expect(html).toContain("Opens for learners on ");
    expect(html).toContain("Learners must first complete: Hygiene 101, Allergens");
    expect(html).toContain("Learners complete lessons in order.");
  });

  it("says so when a course has no lessons", async () => {
    fixture({ empty: true });
    const html = renderToStaticMarkup(await CoursePreviewPage({ params: Promise.resolve({ courseId: "c1" }) }));
    expect(html).toContain("This course has no lessons yet.");
  });

  it("explains the lock on lesson 2 of a sequential course, and not on lesson 1", async () => {
    fixture({ sequentialLock: true });
    expect(await lessonPage("l2")).toContain("Learners unlock this lesson after completing the previous one.");
    expect(await lessonPage("l1")).not.toContain("Learners unlock this lesson");
  });

  it("disables the oral check start button", async () => {
    const html = await lessonPage("l2");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Start oral check<\/button>/);
    expect(html).toContain("Voice oral checks don&#x27;t run in preview.");
    expect(html).toContain("pass mark 70%");
  });

  it("links a quiz lesson to the preview quiz page", async () => {
    const html = await lessonPage("l3");
    expect(html).toMatch(/href="\/preview\/course\/c1\/quiz\/l3"[^>]*>Open assessment/);
    expect(html).toContain("10 min");
  });

  it("keeps learner-progress components off the page", async () => {
    const html = await lessonPage("l1");
    expect(html).not.toContain("Mark complete");
    expect(html).toContain("Lesson 1 of 3");
  });

  it("sends learners away from the preview frame", async () => {
    m.user = { id: "u2", role: "LEARNER", timeMultiplier: 1 };
    await expect(PreviewLayout({ children: createElement("div") })).rejects.toThrow("REDIRECT:/home");
  });
});
