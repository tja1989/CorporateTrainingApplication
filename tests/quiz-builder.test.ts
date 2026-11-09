import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Rows each table returns, keyed by table name (a function gets the query's
// where clause), and the where clauses and limits asked.
const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[] | ((where: unknown) => unknown[])>,
  wheres: [] as { table: string; where: unknown }[],
  limits: [] as { table: string; n: number }[],
}));
vi.mock("@/lib/db/client", async () => {
  const { getTableName } = await import("drizzle-orm");
  return {
    t: await import("../lib/db/schema"),
    db: {
      select: () => {
        let table = "";
        let clause: unknown;
        const q: any = {
          from: (source: any) => {
            table = getTableName(source);
            return q;
          },
          leftJoin: () => q,
          innerJoin: () => q,
          groupBy: () => q,
          orderBy: () => q,
          limit: (n: number) => {
            state.limits.push({ table, n });
            return q;
          },
          where: (where: unknown) => {
            clause = where;
            state.wheres.push({ table, where });
            return q;
          },
          then: (resolve: any, reject: any) => {
            const rows = state.rows[table] ?? [];
            return Promise.resolve(typeof rows === "function" ? rows(clause) : rows).then(resolve, reject);
          },
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
import { LIVE_EXAM_CONFIRMATION_REQUIRED, saveConfirmingLiveExam } from "../lib/quiz/live-exam";

type BuilderProps = Parameters<typeof QuizBuilder>[0];
type Lesson = Parameters<typeof CourseLessonPreview>[0]["lesson"];

const banks = [
  { id: "b1", name: "Fire safety", approvedCount: 3, liveExam: false },
  { id: "b2", name: "First aid", approvedCount: 12, liveExam: false },
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
        passPct: 80,
        attemptsLimit: 3,
        timeLimitSec: 1200,
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

  it("shows the quiz's pass mark, attempts and time limit", () => {
    const html = builder();
    expect(values(html, "passPct")).toEqual(["80"]);
    expect(values(html, "attemptsLimit")).toEqual(["3"]);
    expect(values(html, "timeLimitMinutes")).toEqual(["20"]);
  });

  it("marks only the picked question a live exam uses", () => {
    expect(count(builder(), "Used in a live exam")).toBe(1);
  });

  it("marks a random draw from a bank a live exam uses", () => {
    const html = builder({ banks: [banks[0], { ...banks[1], liveExam: true }] });
    expect(count(html, "Used in a live exam")).toBe(2);
    // The draw's badge sits in its own row, after the picked question's.
    expect(html.lastIndexOf("Used in a live exam")).toBeGreaterThan(html.indexOf("Random draw 2"));
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
      initial: {
        title: "",
        content: { picked: [], draws: [] },
        questions: [],
        exam: false,
        integrity: false,
        passPct: 70,
        attemptsLimit: null,
        timeLimitSec: null,
      },
    });
    expect(values(html, "type")).toEqual(["QUIZ"]);
    expect(values(html, "picked")).toEqual([]);
    expect(html).toContain("Lesson title");
    expect(html).toContain("Add lesson");
    expect(values(html, "passPct")).toEqual(["70"]);
    expect(values(html, "attemptsLimit")).toEqual([""]);
    expect(values(html, "timeLimitMinutes")).toEqual([""]);
  });
});

describe("saveConfirmingLiveExam", () => {
  const quizForm = () => {
    const form = new FormData();
    form.set("title", "Drill");
    form.set("confirmLiveExam", "");
    return form;
  };

  it("asks when a stale page's save needs confirmation, then saves again confirmed", async () => {
    const save = vi.fn()
      .mockResolvedValueOnce({ error: LIVE_EXAM_CONFIRMATION_REQUIRED })
      .mockResolvedValueOnce({ success: "Quiz saved. Submit this revision for approval." });
    const ask = vi.fn(() => true);
    expect(await saveConfirmingLiveExam(save, quizForm(), ask)).toEqual({
      success: "Quiz saved. Submit this revision for approval.",
    });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect((save.mock.calls[1][0] as FormData).get("confirmLiveExam")).toBe("on");
    expect((save.mock.calls[1][0] as FormData).get("title")).toBe("Drill");
  });

  it("stops quietly when the author cancels", async () => {
    const save = vi.fn().mockResolvedValue({ error: LIVE_EXAM_CONFIRMATION_REQUIRED });
    expect(await saveConfirmingLiveExam(save, quizForm(), () => false)).toEqual({ cancelled: true });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("passes other results through without asking", async () => {
    const ask = vi.fn(() => true);
    for (const result of [{ error: "Add at least one question." }, { success: "Saved." }, undefined]) {
      const save = vi.fn().mockResolvedValue(result);
      expect(await saveConfirmingLiveExam(save, quizForm(), ask)).toEqual(result);
      expect(save).toHaveBeenCalledTimes(1);
    }
    expect(ask).not.toHaveBeenCalled();
  });

  it("does not ask twice when the confirmed save still needs confirmation", async () => {
    const form = quizForm();
    form.set("confirmLiveExam", "on");
    const save = vi.fn().mockResolvedValue({ error: LIVE_EXAM_CONFIRMATION_REQUIRED });
    const ask = vi.fn(() => true);
    expect(await saveConfirmingLiveExam(save, form, ask)).toEqual({ error: LIVE_EXAM_CONFIRMATION_REQUIRED });
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("CourseLessonPreview answer key", () => {
  const dialect = new PgDialect();
  const lesson = { id: "l1", type: "QUIZ", title: "Fire quiz", payload: { quizId: "qz" } } as unknown as Lesson;
  const picked = {
    id: "q1",
    type: "mcq_single",
    status: "APPROVED",
    rubric: null,
    body: { prompt: "Which exit is closest to the till?", options: ["North door", "South door"], correct: [1] },
  };
  const drawn = (n: number) => ({
    id: `d${n}`,
    type: "mcq_single",
    status: "APPROVED",
    rubric: null,
    body: { prompt: `Bank question ${n}: which extinguisher suits an electrical fire?`, options: ["Water", "CO2"], correct: [1] },
  });
  /** Picked questions for the picked query, otherwise the bank's questions. */
  const questionsBy = (bank: unknown[]) => (where: unknown) =>
    dialect.sqlToQuery(where as SQL).params.includes("b1") ? bank : [picked];
  const questionQueries = () =>
    state.wheres
      .filter((w) => w.table === "questions")
      .map((w) => dialect.sqlToQuery(w.where as SQL));
  beforeEach(() => {
    state.wheres = [];
    state.limits = [];
    state.rows = {
      quizzes: [{
        id: "qz",
        settings: { passPct: 80, attemptsLimit: 3, feedbackMode: "EXAM", integrityMode: false },
        sections: [{ fixed: ["q1"] }, { bankId: "b1", pickN: 4 }],
      }],
      questions: questionsBy([drawn(1), drawn(2), drawn(3)]),
      question_banks: [{ id: "b1", name: "Fire safety", approvedCount: 3 }],
    };
  });

  it("shows each picked question with its answers, and each random draw", async () => {
    const html = renderToStaticMarkup(await CourseLessonPreview({ lesson }));
    expect(html).toContain("Pass mark 80%");
    expect(html).toContain("Which exit is closest to the till?");
    expect(html).toContain("Correct answer");
    expect(html).toContain("4 random from Fire safety (3 approved questions)");
    expect(questionQueries()[0].params).toEqual(expect.arrayContaining(["q1", "APPROVED"]));
  });

  it("lists, under each random draw, the bank's approved questions with their answers", async () => {
    const html = renderToStaticMarkup(await CourseLessonPreview({ lesson }));
    expect(html).toContain("Show the approved questions in this bank");
    for (const n of [1, 2, 3]) expect(html).toContain(`Bank question ${n}: which extinguisher suits an electrical fire?`);
    // One "Correct answer" for the picked question, one per bank question.
    expect(count(html, "Correct answer")).toBe(4);
    expect(html.indexOf("Show the approved questions in this bank")).toBeGreaterThan(
      html.indexOf("4 random from Fire safety (3 approved questions)"),
    );
    expect(html).not.toContain("more approved questions in this bank");
    const bankQuery = questionQueries().find((q) => q.params.includes("b1"));
    expect(bankQuery?.params).toEqual(expect.arrayContaining(["b1", "APPROVED"]));
    expect(state.limits).toContainEqual({ table: "questions", n: 50 });
  });

  it("shows the first 50 of a bank's approved questions and counts the rest", async () => {
    state.rows.question_banks = [{ id: "b1", name: "Fire safety", approvedCount: 53 }];
    state.rows.questions = questionsBy(Array.from({ length: 50 }, (_, i) => drawn(i + 1)));
    const html = renderToStaticMarkup(await CourseLessonPreview({ lesson }));
    expect(html).toContain("4 random from Fire safety (53 approved questions)");
    expect(html).toContain("Bank question 50:");
    expect(html).toContain("and 3 more approved questions in this bank");
  });

  it("lists nothing under a draw from a bank without approved questions", async () => {
    state.rows.question_banks = [{ id: "b1", name: "Fire safety", approvedCount: 0 }];
    state.rows.questions = questionsBy([]);
    const html = renderToStaticMarkup(await CourseLessonPreview({ lesson }));
    expect(html).toContain("4 random from Fire safety (0 approved questions)");
    expect(html).not.toContain("Show the approved questions in this bank");
  });
});
