import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { learnerLockNote, previewLessonHref } from "../lib/preview/course";
import { toServed } from "../lib/quiz/served";

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
  it("refuses learners and people who cannot read the course", async () => {
    m.actor = { id: "u9", role: "LEARNER", departmentId: null };
    expect(await startPreviewQuizAction("c1", "l1")).toEqual({ error: "Preview is not available." });
    expect(await submitPreviewQuizAction("c1", "l1", [], {})).toEqual({ error: "Preview is not available." });
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

  it("never writes", () => {
    expect(m.writes).not.toHaveBeenCalled();
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
