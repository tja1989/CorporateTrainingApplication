import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Rows each table returns, keyed by table name, and the where clauses asked.
const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  wheres: [] as { table: string; where: unknown }[],
}));
vi.mock("@/lib/db/client", async () => {
  const { getTableName } = await import("drizzle-orm");
  return {
    t: await import("../lib/db/schema"),
    db: {
      select: () => {
        let table = "";
        const q: any = {
          from: (source: any) => {
            table = getTableName(source);
            return q;
          },
          leftJoin: () => q,
          innerJoin: () => q,
          groupBy: () => q,
          orderBy: () => q,
          limit: () => q,
          where: (where: unknown) => {
            state.wheres.push({ table, where });
            return q;
          },
          then: (resolve: any, reject: any) =>
            Promise.resolve(state.rows[table] ?? []).then(resolve, reject),
        };
        return q;
      },
    },
  };
});
vi.mock("@/lib/quiz/composition-actions", () => ({
  searchQuestionsAction: vi.fn(),
  createQuestionInlineAction: vi.fn(),
  copyQuizContentAction: vi.fn(),
  saveQuizAction: vi.fn(),
}));
vi.mock("@/app/(workspace)/admin/courses/actions", () => ({ addLessonAction: vi.fn() }));

import { QuizBuilder } from "../components/quiz-builder";
import { CourseLessonPreview } from "../components/course-lesson-preview";

type BuilderProps = Parameters<typeof QuizBuilder>[0];
type Lesson = Parameters<typeof CourseLessonPreview>[0]["lesson"];

const banks = [
  { id: "b1", name: "Fire safety", approvedCount: 3 },
  { id: "b2", name: "First aid", approvedCount: 12 },
];
const picker = (id: string, prompt: string, liveExam = false) => ({
  id, bankId: "b1", bankName: "Fire safety", type: "mcq_single", prompt, points: 1, liveExam,
});
const builder = (props: Partial<BuilderProps> = {}) =>
  renderToStaticMarkup(
    createElement(QuizBuilder, {
      mode: "edit",
      courseId: "c1",
      lessonId: "l1",
      initial: {
        title: "Fire drill",
        content: { picked: ["q2", "q1"], draws: [{ bankId: "b1", pickN: 5 }, { bankId: "b2", pickN: 2 }] },
        questions: [picker("q1", "Where is the nearest extinguisher?"), picker("q2", "Who calls the fire brigade?", true)],
        exam: false,
        integrity: false,
      },
      banks,
      copySources: [],
      revision: 4,
      ...props,
    }),
  );
/** Values of the inputs with this name, in document order. */
const values = (html: string, name: string) =>
  [...html.matchAll(/<input[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`name="${name}"`))
    .map((tag) => tag.match(/value="([^"]*)"/)?.[1]);
const count = (html: string, text: string) => html.split(text).length - 1;

describe("QuizBuilder", () => {
  it("lists the picked questions in quiz order and posts their ids in that order", () => {
    const html = builder();
    expect(html.indexOf("Who calls the fire brigade?")).toBeLessThan(
      html.indexOf("Where is the nearest extinguisher?"),
    );
    expect(values(html, "picked")).toEqual(["q2", "q1"]);
    expect(values(html, "drawCount")).toEqual(["5", "2"]);
    expect(values(html, "revision")).toEqual(["4"]);
    expect(html).toContain("Save quiz");
  });

  it("marks only the picked question a live exam uses", () => {
    expect(count(builder(), "Used in a live exam")).toBe(1);
  });

  it("warns when a random draw asks for more than the bank's approved questions", () => {
    const html = builder();
    expect(html).toContain(
      "Only 3 approved questions in this bank. Lower the number or add questions before submitting for approval.",
    );
    // First aid has 12 approved questions, enough for its draw of 2.
    expect(count(html, "approved questions in this bank")).toBe(1);
  });

  it("adds a new quiz lesson with an empty builder", () => {
    const html = builder({
      mode: "new",
      lessonId: undefined,
      moduleId: "m1",
      initial: { title: "", content: { picked: [], draws: [] }, questions: [], exam: false, integrity: false },
    });
    expect(values(html, "type")).toEqual(["QUIZ"]);
    expect(values(html, "picked")).toEqual([]);
    expect(html).toContain("Lesson title");
    expect(html).toContain("Add lesson");
  });
});

describe("CourseLessonPreview answer key", () => {
  const dialect = new PgDialect();
  beforeEach(() => {
    state.wheres = [];
    state.rows = {
      quizzes: [{
        id: "qz",
        settings: { passPct: 80, attemptsLimit: 3, feedbackMode: "EXAM", integrityMode: false },
        sections: [{ fixed: ["q1"] }, { bankId: "b1", pickN: 4 }],
      }],
      questions: [{
        id: "q1",
        type: "mcq_single",
        status: "APPROVED",
        rubric: null,
        body: { prompt: "Which exit is closest to the till?", options: ["North door", "South door"], correct: [1] },
      }],
      question_banks: [{ id: "b1", name: "Fire safety", approvedCount: 3 }],
    };
  });

  it("shows each picked question with its answers, and each random draw", async () => {
    const lesson = { id: "l1", type: "QUIZ", title: "Fire quiz", payload: { quizId: "qz" } } as unknown as Lesson;
    const html = renderToStaticMarkup(await CourseLessonPreview({ lesson }));
    expect(html).toContain("Pass mark 80%");
    expect(html).toContain("Which exit is closest to the till?");
    expect(html).toContain("Correct answer");
    expect(html).toContain("4 random from Fire safety (3 approved questions)");
    const questionQuery = state.wheres
      .filter((w) => w.table === "questions")
      .map((w) => dialect.sqlToQuery(w.where as SQL));
    expect(questionQuery).toHaveLength(1);
    expect(questionQuery[0].params).toEqual(expect.arrayContaining(["q1", "APPROVED"]));
  });
});
