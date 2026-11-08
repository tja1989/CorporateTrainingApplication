import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Actor } from "../lib/auth/roles";

type Fields = Record<string, unknown> | undefined;
// Rows each table returns, keyed by table name. A function gets the selected fields.
const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[] | ((fields: Fields) => unknown[])>,
  executes: [] as unknown[],
  wheres: [] as { table: string; where: unknown }[],
  offsets: [] as number[],
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  updates: [] as { table: string; values: Record<string, unknown> }[],
}));
const m = vi.hoisted(() => ({
  user: { id: "u1", role: "INSTRUCTOR", departmentId: "d1" } as Record<string, unknown>,
  requirePermission: vi.fn(),
  createQuestion: vi.fn(),
  liveExam: vi.fn(),
  liveBanks: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/db/client", async () => {
  const { getTableName } = await import("drizzle-orm");
  const conn: any = {
    execute: async (query: unknown) => {
      state.executes.push(query);
    },
    select: (fields?: Record<string, unknown>) => {
      let table = "";
      const read = () => {
        const rows = state.rows[table] ?? [];
        return typeof rows === "function" ? rows(fields) : rows;
      };
      const q: any = {
        from: (source: any) => {
          table = getTableName(source);
          return q;
        },
        innerJoin: () => q,
        leftJoin: () => q,
        orderBy: () => q,
        limit: () => q,
        offset: (n: number) => {
          state.offsets.push(n);
          return q;
        },
        where: (where: unknown) => {
          state.wheres.push({ table, where });
          return q;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve().then(read).then(resolve, reject),
      };
      return q;
    },
    insert: (source: any) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: getTableName(source), values });
      },
    }),
    update: (source: any) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ table: getTableName(source), values });
        },
      }),
    }),
  };
  return {
    t: await import("../lib/db/schema"),
    db: { ...conn, transaction: async (run: any) => run(conn) },
  };
});
vi.mock("@/lib/auth/guard", () => ({ requirePermission: m.requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/questions/bank", () => ({ createQuestion: m.createQuestion }));
vi.mock("@/lib/questions/usage", () => ({
  liveExamQuestionIds: m.liveExam,
  liveExamBankIds: m.liveBanks,
}));

import { db } from "../lib/db/client";
import type { LearningTransaction } from "../lib/lms/learning-cycle";
import {
  assertQuizContent,
  fromSections,
  parseQuizContent,
  quizCopySources,
  toSections,
  type QuizContent,
} from "../lib/quiz/composition";
import {
  copyQuizContentAction,
  createQuestionInlineAction,
  saveQuizAction,
  searchQuestionsAction,
} from "../lib/quiz/composition-actions";

const tx = db as unknown as LearningTransaction;
const dialect = new PgDialect();
const whereOf = (table: string) =>
  state.wheres
    .filter((w) => w.table === table)
    .map((w) => dialect.sqlToQuery(w.where as SQL));
const written = (table: string) =>
  state.updates.filter((u) => u.table === table).map((u) => u.values);
const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [key, value] of entries) f.append(key, value);
  return f;
};
const question = (id: string) => ({
  id,
  bankId: "b1",
  type: "mcq_single",
  points: 2,
  body: { prompt: `Prompt ${id}` },
  status: "APPROVED",
  authorId: null,
  createdBy: "human",
});
const picker = (id: string, liveExam = false) => ({
  id,
  bankId: "b1",
  bankName: "Fire safety",
  type: "mcq_single",
  prompt: `Prompt ${id}`,
  points: 2,
  liveExam,
});
/** `questions` answers: a count, picker rows with their bank name, or ids. */
const questionRows =
  (approved: string[], total = approved.length) =>
  (fields: Fields) => {
    if (fields && "total" in fields) return [{ total }];
    if (fields && "bankName" in fields)
      return approved.map((id) => ({ question: question(id), bankName: "Fire safety" }));
    return approved.map((id) => ({ id }));
  };

beforeEach(() => {
  vi.clearAllMocks();
  m.user = { id: "u1", role: "INSTRUCTOR", departmentId: "d1" };
  m.requirePermission.mockImplementation(async () => m.user);
  m.liveExam.mockResolvedValue(new Set());
  m.liveBanks.mockResolvedValue(new Set());
  state.rows = {};
  state.executes = [];
  state.wheres = [];
  state.offsets = [];
  state.inserts = [];
  state.updates = [];
});

describe("quiz sections", () => {
  it("stores picked questions first, then one section per random draw", () => {
    const content: QuizContent = {
      picked: ["a", "b"],
      draws: [
        { bankId: "x", pickN: 3 },
        { bankId: "y", pickN: 1 },
      ],
    };
    expect(toSections(content)).toEqual([
      { fixed: ["a", "b"] },
      { bankId: "x", pickN: 3 },
      { bankId: "y", pickN: 1 },
    ]);
    expect(fromSections(toSections(content))).toEqual(content);
  });

  it("leaves out the fixed section when nothing is picked", () => {
    const content: QuizContent = { picked: [], draws: [{ bankId: "x", pickN: 2 }] };
    expect(toSections(content)).toEqual([{ bankId: "x", pickN: 2 }]);
    expect(fromSections(toSections(content))).toEqual(content);
  });

  it("joins every fixed list in order and collects the draws", () => {
    expect(
      fromSections([{ fixed: ["a"] }, { bankId: "b", pickN: 5 }, { fixed: ["c"] }]),
    ).toEqual({ picked: ["a", "c"], draws: [{ bankId: "b", pickN: 5 }] });
  });
});

describe("parseQuizContent", () => {
  it("keeps the picked order", () => {
    const parsed = parseQuizContent(
      form([["picked", "q3"], ["picked", "q1"], ["picked", "q2"]]),
    );
    expect(parsed).toEqual({ picked: ["q3", "q1", "q2"], draws: [] });
  });

  it("pairs draw banks with counts and drops blank draw rows", () => {
    const parsed = parseQuizContent(
      form([
        ["drawBank", "b1"], ["drawCount", "5"],
        ["drawBank", ""], ["drawCount", " "],
        ["drawBank", "b2"], ["drawCount", "2"],
      ]),
    );
    expect(parsed.draws).toEqual([
      { bankId: "b1", pickN: 5 },
      { bankId: "b2", pickN: 2 },
    ]);
  });

  it("keeps a half-filled draw row so saving can explain it", () => {
    const parsed = parseQuizContent(
      form([["drawBank", "b1"], ["drawCount", ""], ["drawBank", ""], ["drawCount", "4"]]),
    );
    expect(parsed.draws).toEqual([
      { bankId: "b1", pickN: NaN },
      { bankId: "", pickN: 4 },
    ]);
  });
});

describe("assertQuizContent", () => {
  beforeEach(() => {
    state.rows.questions = questionRows(["q1", "q2"]);
    state.rows.question_banks = [{ id: "b1" }];
  });
  const refuses = (content: QuizContent, message: string) =>
    expect(assertQuizContent(tx, content)).rejects.toThrow(message);

  it("accepts approved picks and draws from existing banks", async () => {
    await expect(
      assertQuizContent(tx, { picked: ["q1", "q2"], draws: [{ bankId: "b1", pickN: 3 }] }),
    ).resolves.toBeUndefined();
  });

  it("needs at least one question", async () => {
    await refuses({ picked: [], draws: [] }, "Add at least one question.");
    await refuses({ picked: [], draws: [{ bankId: "b1", pickN: 0 }] }, "Add at least one question.");
  });

  it("refuses a question picked twice", async () => {
    await refuses({ picked: ["q1", "q1"], draws: [] }, "Each question can appear only once.");
  });

  it("refuses a picked question that is missing or not approved", async () => {
    await refuses(
      { picked: ["q1", "q2", "gone"], draws: [] },
      "One or more picked questions are no longer available. Remove them and save again.",
    );
    const [query] = whereOf("questions");
    expect(query.sql).toContain('"status" = $');
    expect(query.params).toEqual(expect.arrayContaining(["q1", "q2", "gone", "APPROVED"]));
  });

  it("refuses a random count that is not a whole number from 1 to 100", async () => {
    for (const pickN of [0, 101, 2.5, -1, NaN])
      await refuses(
        { picked: ["q1", "q2"], draws: [{ bankId: "b1", pickN }] },
        "Random questions must be a whole number from 1 to 100.",
      );
    await expect(
      assertQuizContent(tx, { picked: [], draws: [{ bankId: "b1", pickN: 100 }] }),
    ).resolves.toBeUndefined();
  });

  it("refuses a draw without a known bank", async () => {
    state.rows.question_banks = [];
    await refuses(
      { picked: [], draws: [{ bankId: "nope", pickN: 2 }] },
      "Choose a question bank for each random draw.",
    );
    await refuses(
      { picked: [], draws: [{ bankId: "", pickN: 2 }] },
      "Choose a question bank for each random draw.",
    );
  });
});

describe("saveQuizAction", () => {
  const ana: Actor = { id: "ana", role: "INSTRUCTOR", departmentId: null };
  const settings = { passPct: 80, attemptsLimit: 3, feedbackMode: "EXAM", integrityMode: true };
  const quizForm = (...extra: [string, string][]) =>
    form([
      ["title", " Fire drill "],
      ["picked", "q1"], ["picked", "q2"],
      ["drawBank", "b1"], ["drawCount", "3"],
      ["revision", "4"],
      ...extra,
    ]);
  beforeEach(() => {
    m.user = { ...ana };
    m.liveExam.mockResolvedValue(new Set(["q1"]));
    state.rows = {
      users: [{ id: "ana", role: "INSTRUCTOR", erasedAt: null, passwordState: "ACTIVE", departmentId: null }],
      courses: [{ id: "c", status: "DRAFT", approvalState: "DRAFT", contentRevision: 4, instructorId: "ana", departmentId: null }],
      lessons: [{ lesson: { id: "l1", moduleId: "m1", type: "QUIZ", title: "Old", payload: { quizId: "qz" } } }],
      quizzes: [{ id: "qz", lessonId: "l1", title: "Old", settings, sections: [{ fixed: ["q9"] }] }],
      questions: questionRows(["q1", "q2"]),
      question_banks: [{ id: "b1" }],
    };
  });
  const nothingWritten = () => {
    expect(state.updates).toEqual([]);
    expect(state.inserts).toEqual([]);
  };

  it("asks to confirm a practice quiz that picks a live-exam question", async () => {
    expect(await saveQuizAction("c", "l1", quizForm())).toEqual({
      error: "Confirm that learners will see answers to questions used in a live exam.",
    });
    expect(m.liveExam).toHaveBeenCalledWith(["q1", "q2"], expect.anything());
    nothingWritten();
  });

  it("saves once confirmed, keeping the other quiz settings", async () => {
    expect(await saveQuizAction("c", "l1", quizForm(["confirmLiveExam", "on"]))).toEqual({
      success: "Quiz saved. Submit this revision for approval.",
    });
    expect(m.requirePermission).toHaveBeenCalledWith("course.author");
    expect(written("quizzes")).toEqual([
      {
        title: "Fire drill",
        sections: [{ fixed: ["q1", "q2"] }, { bankId: "b1", pickN: 3 }],
        settings: { ...settings, feedbackMode: "PRACTICE", integrityMode: false },
      },
    ]);
    expect(written("lessons")).toEqual([{ title: "Fire drill" }]);
    expect(written("courses")).toEqual([
      expect.objectContaining({ contentRevision: 5, approvalState: "DRAFT", approvedRevision: null }),
    ]);
    const [lessonQuery] = whereOf("lessons");
    expect(lessonQuery.params).toEqual(expect.arrayContaining(["l1", "c"]));
    expect(m.revalidatePath).toHaveBeenCalledWith("/instructor/courses/c");
  });

  it("asks to confirm a practice quiz whose only content draws from a live-exam bank", async () => {
    m.liveExam.mockResolvedValue(new Set());
    m.liveBanks.mockResolvedValue(new Set(["b1"]));
    const drawOnly = (...extra: [string, string][]) =>
      form([["title", "Drill"], ["drawBank", "b1"], ["drawCount", "3"], ["revision", "4"], ...extra]);
    expect(await saveQuizAction("c", "l1", drawOnly())).toEqual({
      error: "Confirm that learners will see answers to questions used in a live exam.",
    });
    expect(m.liveBanks).toHaveBeenCalledWith(["b1"], expect.anything());
    nothingWritten();
    expect(await saveQuizAction("c", "l1", drawOnly(["confirmLiveExam", "on"]))).toEqual({
      success: "Quiz saved. Submit this revision for approval.",
    });
    expect(written("quizzes")).toEqual([
      expect.objectContaining({ sections: [{ bankId: "b1", pickN: 3 }] }),
    ]);
  });

  it("needs no confirmation when neither the picks nor the draws are in a live exam", async () => {
    m.liveExam.mockResolvedValue(new Set());
    expect(await saveQuizAction("c", "l1", quizForm())).toEqual({
      success: "Quiz saved. Submit this revision for approval.",
    });
    expect(m.liveBanks).toHaveBeenCalledWith(["b1"], expect.anything());
  });

  it("needs no confirmation for an exam quiz", async () => {
    const result = await saveQuizAction("c", "l1", quizForm(["exam", "on"], ["integrity", "on"]));
    expect(result).toEqual({ success: "Quiz saved. Submit this revision for approval." });
    expect(written("quizzes")[0].settings).toEqual({ ...settings, feedbackMode: "EXAM", integrityMode: true });
  });

  it("keeps the old content when the course changed since the form loaded", async () => {
    const stale = quizForm(["confirmLiveExam", "on"]);
    stale.set("revision", "3");
    expect(await saveQuizAction("c", "l1", stale)).toEqual({
      error: "This course changed. Reload before saving.",
    });
    nothingWritten();
  });

  it("needs a title", async () => {
    const untitled = quizForm();
    untitled.set("title", "  ");
    expect(await saveQuizAction("c", "l1", untitled)).toEqual({ error: "Enter a quiz title." });
    expect(state.executes).toEqual([]);
    nothingWritten();
  });

  it("refuses a lesson outside the course or one that is not a quiz", async () => {
    state.rows.lessons = [];
    expect(await saveQuizAction("c", "elsewhere", quizForm())).toEqual({
      error: "This lesson does not belong to this course.",
    });
    state.rows.lessons = [{ lesson: { id: "l1", moduleId: "m1", type: "TEXT", title: "Read", payload: { body: "x" } } }];
    expect(await saveQuizAction("c", "l1", quizForm())).toEqual({ error: "This lesson is not a quiz." });
    nothingWritten();
  });

  it("returns the content error and writes nothing", async () => {
    expect(await saveQuizAction("c", "l1", form([["title", "Empty"], ["revision", "4"]]))).toEqual({
      error: "Add at least one question.",
    });
    nothingWritten();
  });
});

describe("searchQuestionsAction", () => {
  it("searches approved questions as the signed-in author", async () => {
    state.rows.questions = questionRows(["q1"], 51);
    m.liveExam.mockResolvedValue(new Set(["q1"]));
    const result = await searchQuestionsAction({
      bank: "b1",
      type: "mcq_single",
      q: " 50%_off\\ ",
      mine: true,
      page: 2,
    });
    expect(result).toEqual({ rows: [picker("q1", true)], more: true });
    expect(m.requirePermission).toHaveBeenCalledWith("question.author");
    for (const query of whereOf("questions")) {
      expect(query.params).toEqual(
        expect.arrayContaining(["APPROVED", "b1", "mcq_single", "u1", "%50\\%\\_off\\\\%"]),
      );
    }
    expect(state.offsets).toEqual([25]);
  });

  it("ignores unknown types, adds no author filter unless asked, and caps the page", async () => {
    state.rows.questions = questionRows([], 0);
    const result = await searchQuestionsAction({ type: "constructor", page: 999999 });
    expect(result).toEqual({ rows: [], more: false });
    for (const query of whereOf("questions")) expect(query.params).toEqual(["APPROVED"]);
    expect(state.offsets).toEqual([999 * 25]);
  });
});

describe("createQuestionInlineAction", () => {
  const mcq: [string, string][] = [
    ["bankId", "b1"], ["type", "mcq_single"], ["prompt", "Pick one"], ["points", "2"],
    ["option", "A"], ["option", "B"], ["correct", "1"],
  ];

  it("returns the validation error without creating anything", async () => {
    const result = await createQuestionInlineAction(
      form([["bankId", "b1"], ["type", "mcq_single"], ["prompt", " "]]),
    );
    expect(result).toEqual({ error: "Enter the question." });
    expect(m.createQuestion).not.toHaveBeenCalled();
  });

  it("returns the bank's refusal", async () => {
    m.createQuestion.mockRejectedValue(
      new Error("This bank feeds live training (Safety). Choose another bank or create a new one."),
    );
    expect(await createQuestionInlineAction(form(mcq))).toEqual({
      error: "This bank feeds live training (Safety). Choose another bank or create a new one.",
    });
  });

  it("creates as the signed-in author and returns the picker row", async () => {
    m.createQuestion.mockResolvedValue({ id: "q9", bumpedCourseIds: [] });
    state.rows.questions = questionRows(["q9"]);
    const result = await createQuestionInlineAction(form([...mcq, ["actor", "evil"], ["role", "ADMIN"]]));
    expect(result).toEqual({ question: picker("q9") });
    expect(m.requirePermission).toHaveBeenCalledWith("question.author");
    expect(m.createQuestion).toHaveBeenCalledWith(
      { id: "u1", role: "INSTRUCTOR", departmentId: "d1" },
      "b1",
      expect.objectContaining({ type: "mcq_single", points: 2 }),
    );
  });

  it("returns the course's revision as it stands after the write when the write bumped it", async () => {
    state.rows.questions = questionRows(["q9"]);
    state.rows.courses = [{ id: "c1", contentRevision: 4, instructorId: "u1", departmentId: "d1" }];
    m.createQuestion.mockImplementation(async () => {
      // Writing into a bank this draft draws from bumps its revision.
      state.rows.courses = [{ id: "c1", contentRevision: 5, instructorId: "u1", departmentId: "d1" }];
      return { id: "q9", bumpedCourseIds: ["c0", "c1"] };
    });
    expect(await createQuestionInlineAction(form([...mcq, ["courseId", "c1"]]))).toEqual({
      question: picker("q9"),
      revision: 5,
    });
    expect(whereOf("courses").map((q) => q.params)).toEqual([["c1"]]);
  });

  it("leaves the revision out when the write did not bump that course", async () => {
    state.rows.questions = questionRows(["q9"]);
    // Another change moved the course on: the next save must still see it as stale.
    state.rows.courses = [{ id: "c1", contentRevision: 6, instructorId: "u1", departmentId: "d1" }];
    m.createQuestion.mockResolvedValue({ id: "q9", bumpedCourseIds: ["other"] });
    const result = await createQuestionInlineAction(form([...mcq, ["courseId", "c1"]]));
    expect(result).toEqual({ question: picker("q9") });
    expect(whereOf("courses")).toEqual([]);
  });

  it("leaves the revision out for a course the author cannot read or that is missing", async () => {
    m.createQuestion.mockResolvedValue({ id: "q9", bumpedCourseIds: ["c2", "gone"] });
    state.rows.questions = questionRows(["q9"]);
    state.rows.courses = [{ id: "c2", contentRevision: 7, instructorId: "someone-else", departmentId: "d2" }];
    expect(await createQuestionInlineAction(form([...mcq, ["courseId", "c2"]]))).not.toHaveProperty("revision");
    state.rows.courses = [];
    expect(await createQuestionInlineAction(form([...mcq, ["courseId", "gone"]]))).not.toHaveProperty("revision");
  });
});

describe("copying from another quiz", () => {
  const source = (course: Record<string, unknown>, type = "QUIZ") => [
    { lesson: { id: "src-lesson", type, payload: { quizId: "src" } }, course },
  ];
  beforeEach(() => {
    state.rows.quizzes = [
      { id: "src", sections: [{ fixed: ["q2", "q1", "q3"] }, { bankId: "b2", pickN: 4 }] },
    ];
    // q3 is retired: only q1 and q2 come back as approved.
    state.rows.questions = questionRows(["q1", "q2"]);
  });

  it("copies approved picks in order, plus the draws, from a course the author can read", async () => {
    state.rows.lessons = source({ status: "DRAFT", instructorId: "u1", departmentId: "d1" });
    expect(await copyQuizContentAction("src-lesson")).toEqual({
      content: { picked: ["q2", "q1"], draws: [{ bankId: "b2", pickN: 4 }] },
      questions: [picker("q2"), picker("q1")],
    });
    expect(m.requirePermission).toHaveBeenCalledWith("question.author");
    expect(whereOf("questions")[0].params).toEqual(expect.arrayContaining(["APPROVED"]));
  });

  it("copies from any published course", async () => {
    state.rows.lessons = source({ status: "PUBLISHED", instructorId: "someone-else", departmentId: "d2" });
    expect(await copyQuizContentAction("src-lesson")).toMatchObject({
      content: { picked: ["q2", "q1"] },
    });
  });

  it("refuses a quiz the author cannot read, a missing lesson and a non-quiz lesson", async () => {
    const unavailable = { error: "This quiz is not available to copy." };
    state.rows.lessons = source({ status: "DRAFT", instructorId: "someone-else", departmentId: "d1" });
    expect(await copyQuizContentAction("src-lesson")).toEqual(unavailable);
    state.rows.lessons = [];
    expect(await copyQuizContentAction("missing")).toEqual(unavailable);
    state.rows.lessons = source({ status: "PUBLISHED", instructorId: "u1", departmentId: "d1" }, "TEXT");
    expect(await copyQuizContentAction("src-lesson")).toEqual(unavailable);
  });

  it("lists quizzes from readable courses and published courses", async () => {
    const quiz = (lessonId: string, courseTitle: string, status: string, instructorId: string) => ({
      lessonId, quizTitle: `${lessonId} quiz`, courseTitle, status, instructorId, departmentId: "d1",
    });
    state.rows.lessons = [
      quiz("mine", "Fire", "DRAFT", "u1"),
      quiz("theirs", "Hidden", "DRAFT", "someone-else"),
      quiz("public", "First aid", "PUBLISHED", "someone-else"),
    ];
    const ana: Actor = { id: "u1", role: "INSTRUCTOR", departmentId: "d1" };
    expect(await quizCopySources(ana)).toEqual([
      { lessonId: "mine", label: "Fire — mine quiz" },
      { lessonId: "public", label: "First aid — public quiz" },
    ]);
    const hr: Actor = { id: "h1", role: "HR_HEAD", departmentId: null };
    expect((await quizCopySources(hr)).map((s) => s.lessonId)).toEqual(["mine", "theirs", "public"]);
  });
});
