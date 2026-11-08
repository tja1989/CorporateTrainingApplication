import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const m = vi.hoisted(() => ({
  actor: { id: "u1", role: "INSTRUCTOR", departmentId: null } as { id: string; role: string; departmentId: string | null },
  rows: {} as Record<string, unknown[]>,
  writes: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireUser: async () => m.actor }));
vi.mock("@/lib/db/client", async () => {
  const schema = await import("../lib/db/schema");
  const tableName = (tbl: unknown) => Object.entries(schema).find(([, v]) => v === tbl)?.[0] ?? "?";
  const chain = (name: string) => {
    const result = () => m.rows[name] ?? [];
    const c: Record<string, unknown> = {
      where: () => c,
      orderBy: () => c,
      limit: async () => result(),
      then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
    };
    return c;
  };
  const writeFail = (op: string) => () => {
    m.writes(op);
    throw new Error("write in preview");
  };
  return {
    t: schema,
    db: {
      select: () => ({ from: (tbl: unknown) => chain(tableName(tbl)) }),
      insert: writeFail("insert"),
      update: writeFail("update"),
      delete: writeFail("delete"),
      transaction: writeFail("transaction"),
    },
  };
});

import { previewScore } from "../lib/preview/score";
import { startPreviewQuizAction, submitPreviewQuizAction } from "../lib/preview/quiz-actions";
import { learnerLockNote, loadPreviewCourse, previewLessonHref } from "../lib/preview/course";
import { toServed } from "../lib/quiz/served";
import { PreviewQuizRunner, PreviewResultView } from "../components/preview-quiz-runner";
import type { PreviewResult } from "../lib/preview/score";

const settings = {
  attemptsLimit: null, cooldownMinutes: 0, gradingMethod: "highest", passPct: 70, shuffleQuestions: false,
  shuffleChoices: false, oneAtATime: false, noBacktrack: false, feedbackMode: "PRACTICE", graceSec: 30, integrityMode: false,
};
const q = (id: string, bankId = "b1", extra: Record<string, unknown> = {}) => ({
  id, bankId, type: "mcq_single", status: "APPROVED", points: 1, rubric: null,
  body: { prompt: `P ${id}`, options: ["a", "b", "c"], correct: [0] }, ...extra,
});

function seed(sections: unknown[], questions: unknown[]) {
  m.rows = {
    courses: [{ id: "c1", instructorId: "u1", departmentId: null, status: "DRAFT", sequentialLock: true }],
    modules: [{ id: "m1", courseId: "c1" }],
    lessons: [{ id: "l1", moduleId: "m1", type: "QUIZ", payload: { quizId: "qz" } }],
    quizzes: [{ id: "qz", settings, sections }],
    questions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.actor = { id: "u1", role: "INSTRUCTOR", departmentId: null };
  seed([{ fixed: ["q1"] }], [q("q1")]);
});

describe("previewScore", () => {
  it("unmaps a shuffled mcq answer before scoring", () => {
    const r = previewScore(
      [{ q: { ...q("q1"), type: "mcq_single" } as never, served: { questionId: "q1", order: 0, choiceOrder: [1, 2, 0] }, answer: { kind: "choice", selected: [2] } }],
      70,
    );
    expect(r).toMatchObject({ earned: 1, possible: 1, pct: 100, passed: true });
  });

  it("excludes free text from the total and counts it as written", () => {
    const r = previewScore(
      [
        { q: q("q1") as never, served: { questionId: "q1", order: 0 }, answer: { kind: "choice", selected: [0] } },
        { q: q("q2", "b1", { type: "free_text" }) as never, served: { questionId: "q2", order: 1 }, answer: { kind: "text", text: "x" } },
      ],
      70,
    );
    expect(r).toMatchObject({ earned: 1, possible: 1, pct: 100, writtenCount: 1 });
    expect(r.earnedById.get("q2")).toBeNull();
  });

  it("fails with 0% when nothing is auto-scorable", () => {
    const r = previewScore([{ q: q("q2", "b1", { type: "free_text" }) as never, served: { questionId: "q2", order: 0 }, answer: undefined }], 0);
    expect(r).toMatchObject({ possible: 0, pct: 0, passed: false, writtenCount: 1 });
  });

  it("rounds pct to one decimal like scoreQuiz", () => {
    const items = [0, 1, 2].map((i) => ({ q: q(`q${i}`) as never, served: { questionId: `q${i}`, order: i }, answer: i === 0 ? { kind: "choice" as const, selected: [0] } : undefined }));
    expect(previewScore(items, 30).pct).toBe(33.3);
  });
});

describe("preview actions", () => {
  // Preview writes nothing, whatever the case.
  afterEach(() => {
    expect(m.writes).not.toHaveBeenCalled();
  });

  it("refuses learners and people who cannot read the course", async () => {
    m.actor = { id: "u9", role: "LEARNER", departmentId: null };
    expect(await startPreviewQuizAction("c1", "l1")).toEqual({ error: "Preview is not available." });
    expect(await submitPreviewQuizAction("c1", "l1", [], {})).toEqual({ error: "Preview is not available." });
  });

  it("refuses an instructor who does not own the course and a Department Head of another department", async () => {
    (m.rows.courses as { departmentId: string | null }[])[0].departmentId = "d1";
    for (const actor of [
      { id: "u2", role: "INSTRUCTOR", departmentId: "d1" },
      { id: "h2", role: "DEPARTMENT_HEAD", departmentId: "d2" },
    ]) {
      m.actor = actor;
      expect(await startPreviewQuizAction("c1", "l1")).toEqual({ error: "Preview is not available." });
      expect(
        await submitPreviewQuizAction("c1", "l1", [{ questionId: "q1", order: 0 }], { q1: { kind: "choice", selected: [0] } }),
      ).toEqual({ error: "Preview is not available." });
      expect(await loadPreviewCourse(actor as never, "c1")).toBeNull();
    }
  });

  it("lets the owning instructor and the course's Department Head preview", async () => {
    (m.rows.courses as { departmentId: string | null }[])[0].departmentId = "d1";
    for (const actor of [
      { id: "u1", role: "INSTRUCTOR", departmentId: null },
      { id: "h1", role: "DEPARTMENT_HEAD", departmentId: "d1" },
    ]) {
      m.actor = actor;
      expect(await loadPreviewCourse(actor as never, "c1")).toMatchObject({ course: { id: "c1" }, lessons: [{ id: "l1" }] });
      expect((await startPreviewQuizAction("c1", "l1")).start?.servedItems).toEqual([{ questionId: "q1", order: 0 }]);
    }
  });

  it("refuses a lesson that is not a quiz in this course", async () => {
    (m.rows.modules as { courseId: string }[])[0].courseId = "other";
    expect(await startPreviewQuizAction("c1", "l1")).toEqual({ error: "Preview is not available." });
  });

  it("says so when the quiz has no questions", async () => {
    seed([], []);
    expect(await startPreviewQuizAction("c1", "l1")).toEqual({ error: "This quiz has no questions yet." });
  });

  it("serves only what exists when a draw asks for more than the bank holds", async () => {
    seed([{ bankId: "b1", pickN: 5 }], [q("q1"), q("q2"), q("q3")]);
    const r = await startPreviewQuizAction("c1", "l1");
    expect(r.start?.servedItems).toHaveLength(3);
    expect(r.start?.served).toHaveLength(3);
    expect(JSON.stringify(r.start)).not.toContain("correct");
    expect(r.start?.settings.passPct).toBe(70);
  });

  it("rejects a question the quiz could never serve", async () => {
    seed([{ fixed: ["q1"] }], [q("q1"), q("foreign", "b9")]);
    const r = await submitPreviewQuizAction("c1", "l1", [{ questionId: "foreign", order: 0 }], {});
    expect(r).toEqual({ error: "This preview no longer matches the quiz. Start again." });
  });

  it("rejects a draw-bank question that is not approved, and duplicates", async () => {
    seed([{ bankId: "b1", pickN: 2 }], [q("d1", "b1", { status: "DRAFT" }), q("q1")]);
    expect(await submitPreviewQuizAction("c1", "l1", [{ questionId: "d1", order: 0 }], {})).toEqual({ error: "This preview no longer matches the quiz. Start again." });
    expect(await submitPreviewQuizAction("c1", "l1", [{ questionId: "q1", order: 0 }, { questionId: "q1", order: 1 }], {})).toEqual({ error: "This preview no longer matches the quiz. Start again." });
  });

  it("scores from stored bodies, ignoring anything the client claims", async () => {
    seed([{ fixed: ["q1", "q2"] }], [q("q1"), q("q2", "b1", { type: "free_text", rubric: { criteria: [], modelAnswer: "m" } })]);
    const r = await submitPreviewQuizAction(
      "c1", "l1",
      [{ questionId: "q1", order: 0, choiceOrder: [1, 2, 0] }, { questionId: "q2", order: 1 }],
      { q1: { kind: "choice", selected: [2] }, q2: { kind: "text", text: "essay" } },
    );
    expect(r.result).toMatchObject({ earned: 1, possible: 1, pct: 100, passed: true, passPct: 70, writtenCount: 1 });
    expect(r.result?.items.map((i) => [i.questionId, i.earned])).toEqual([["q1", 1], ["q2", null]]);
    expect(r.result?.items[0].body.correct).toEqual([0]);
    expect(r.result?.items[1].rubric?.modelAnswer).toBe("m");
  });

});

describe("preview helpers", () => {
  it("links lessons into the preview route", () => {
    expect(previewLessonHref("c1", "l1")).toBe("/preview/course/c1/lesson/l1");
  });
  it("only notes a lock after the first lesson of a sequential course", () => {
    expect(learnerLockNote({ sequentialLock: true }, 1)).toBe("Learners unlock this lesson after completing the previous one.");
    expect(learnerLockNote({ sequentialLock: true }, 0)).toBeNull();
    expect(learnerLockNote({ sequentialLock: false }, 3)).toBeNull();
  });
  it("toServed shows options in the shuffled order", () => {
    const s = toServed(q("q1") as never, { questionId: "q1", order: 0, choiceOrder: [1, 2, 0] });
    expect(s.options).toEqual(["b", "c", "a"]);
  });
});

describe("PreviewQuizRunner", () => {
  const WRITTEN_NOTE = "Written answers are graded by AI and reviewed by people for learners. Not scored in preview.";
  const written: PreviewResult["items"][number] = {
    questionId: "w1", type: "free_text", prompt: "Explain how you report a hazard.", points: 2, earned: null,
    body: { prompt: "Explain how you report a hazard." },
    rubric: { criteria: [{ name: "Names the supervisor", points: 2 }], modelAnswer: "Tell the supervisor straight away." },
  };
  const choice: PreviewResult["items"][number] = {
    questionId: "c1", type: "mcq_single", prompt: "Which extinguisher suits electrical fires?", points: 1, earned: 0,
    body: { prompt: "Which extinguisher suits electrical fires?", options: ["Water", "Carbon dioxide"], correct: [1] },
    rubric: null,
  };
  const result = (items: PreviewResult["items"], possible: number): PreviewResult => ({
    earned: 0, possible, pct: 0, passed: false, passPct: 70, writtenCount: items.filter((i) => i.earned === null).length, items,
  });
  const rules = { attemptsLimit: 3, integrityMode: false, exam: false, cooldownMinutes: 0, availableFrom: null, availableUntil: null };
  const runner = (extra: Partial<typeof rules> | Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(PreviewQuizRunner, {
      courseId: "c1", lessonId: "l1", lessonHref: "/preview/course/c1/lesson/l1", rules: { ...rules, ...extra },
    }));

  it("shows the score and pass mark when something is scorable", () => {
    const html = renderToStaticMarkup(createElement(PreviewResultView, { result: result([choice, written], 1) }));
    expect(html).toContain("Score 0 of 1 (0%)");
    expect(html).toContain("Not passed");
    expect(html).toContain("Pass mark 70%");
    expect(html).toContain(WRITTEN_NOTE);
  });

  it("shows only the written-answer note and the answer keys when nothing is scorable", () => {
    const html = renderToStaticMarkup(createElement(PreviewResultView, { result: result([written], 0) }));
    for (const text of ["Score", "Passed", "Not passed", "Pass mark"]) expect(html).not.toContain(text);
    expect(html).toContain(WRITTEN_NOTE);
    expect(html).toContain("Explain how you report a hazard.");
    expect(html).toContain("Marking rubric");
    expect(html).toContain("Tell the supervisor straight away.");
  });

  it("says how long learners wait between attempts", () => {
    expect(runner({ cooldownMinutes: 30 })).toContain("Learners wait 30 minutes between attempts.");
    expect(runner({ cooldownMinutes: 1 })).toContain("Learners wait 1 minute between attempts.");
    expect(runner()).not.toContain("between attempts");
  });

  it("says when the quiz is open to learners, in the organisation's time zone", () => {
    const from = "2026-11-10T06:00:00.000Z";
    const until = "2026-11-20T15:30:00.000Z";
    expect(runner({ availableFrom: from, availableUntil: until })).toContain(
      "Open to learners from Tue 10 Nov 2026, 10:00 until Fri 20 Nov 2026, 19:30.",
    );
    expect(runner({ availableFrom: from })).toContain("Open to learners from Tue 10 Nov 2026, 10:00.");
    expect(runner({ availableUntil: until })).toContain("Open to learners until Fri 20 Nov 2026, 19:30.");
    expect(runner()).not.toContain("Open to learners");
  });
});
