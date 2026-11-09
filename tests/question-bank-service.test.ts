import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Actor } from "../lib/auth/roles";
import type { QuestionDraft } from "../lib/questions/validate";

// Rows each table returns, keyed by table name. A function is called per query.
const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[] | (() => unknown[])>,
  executes: [] as unknown[],
  wheres: [] as { table: string; where: unknown }[],
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  updates: [] as { table: string; values: Record<string, unknown> }[],
}));
vi.mock("@/lib/db/client", async () => {
  const { getTableName } = await import("drizzle-orm");
  const read = (table: string) => {
    const rows = state.rows[table] ?? [];
    return typeof rows === "function" ? rows() : rows;
  };
  const conn: any = {
    execute: async (query: unknown) => {
      state.executes.push(query);
    },
    select: () => {
      let table = "";
      const q: any = {
        from: (source: any) => {
          table = getTableName(source);
          return q;
        },
        innerJoin: () => q,
        where: (where: unknown) => {
          state.wheres.push({ table, where });
          return q;
        },
        limit: async () => read(table),
        then: (resolve: any, reject: any) =>
          Promise.resolve()
            .then(() => read(table))
            .then(resolve, reject),
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
import { db } from "../lib/db/client";
import {
  reopenDraftCourses,
  updateDraftQuestion,
} from "../lib/courses/questions";
import { createBank, createQuestion, editQuestion, removeQuestion } from "../lib/questions/bank";
import { liveExamBankIds, reviewableDraftBankIds } from "../lib/questions/usage";

const dialect = new PgDialect();
const toQuery = (value: unknown) => dialect.sqlToQuery(value as SQL);
/** Advisory locks taken, in order: "assessment" or the curriculum lock key. */
const locks = () =>
  state.executes.map((statement) => {
    const query = toQuery(statement);
    return query.sql.includes("assessment-curriculum")
      ? "assessment"
      : String(query.params[0]);
  });

const ana: Actor = { id: "ana", role: "INSTRUCTOR", departmentId: null };
const person = (actor: Actor, role: string = actor.role) => ({
  id: actor.id,
  role,
  erasedAt: null,
  passwordState: "ACTIVE",
  departmentId: null,
});
type Course = { id: string; title: string; status: string; approvalState: string };
const course = (
  id: string,
  status = "DRAFT",
  approvalState = "DRAFT",
): Course => ({ id, title: `Course ${id}`, status, approvalState });
const quiz = (
  c: Course,
  sections: unknown[],
  feedbackMode = "PRACTICE",
) => ({
  courseId: c.id,
  courseTitle: c.title,
  status: c.status,
  approvalState: c.approvalState,
  lessonId: `lesson-${c.id}`,
  quizTitle: `Quiz ${c.id}`,
  sections,
  settings: { feedbackMode },
});
/** Rows for `SELECT * FROM courses WHERE id = …`, served in lock order. */
const courseRows = (...rows: Course[]) => {
  const queue = rows.map((row) => ({ ...row, contentRevision: 4 }));
  return () => [queue.shift()];
};
const bump = {
  contentRevision: 5,
  approvalState: "DRAFT",
  submittedRevision: null,
  approvedRevision: null,
  submittedBy: null,
  approvedBy: null,
};
const draft: QuestionDraft = {
  type: "truefalse",
  points: 2,
  body: { prompt: "Fire exits must stay clear.", correct: [0] },
  rubric: null,
};
const written = (table: string) =>
  state.updates.filter((u) => u.table === table).map((u) => u.values);

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = { users: [person(ana)] };
  state.executes = [];
  state.wheres = [];
  state.inserts = [];
  state.updates = [];
});

describe("createBank", () => {
  it("refuses a name an existing bank has, ignoring case and spacing", async () => {
    state.rows.question_banks = [{ name: "Fire  Safety" }];
    await expect(
      createBank(ana, { name: "  fire safety ", tags: [] }),
    ).rejects.toThrow("A bank with this name already exists.");
    expect(locks()).toEqual(["assessment"]);
    expect(state.inserts).toEqual([]);
  });

  it("requires a name", async () => {
    await expect(createBank(ana, { name: "   ", tags: [] })).rejects.toThrow(
      "Enter a bank name.",
    );
    expect(state.inserts).toEqual([]);
  });

  it("stores the trimmed, single-spaced name with no course", async () => {
    state.rows.question_banks = [{ name: "Forklift Basics" }];
    const bankId = await createBank(ana, {
      name: "  Fire \t  Safety ",
      tags: ["safety"],
    });
    expect(bankId).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.inserts).toEqual([
      {
        table: "question_banks",
        values: { id: bankId, name: "Fire Safety", courseId: null, tags: ["safety"] },
      },
    ]);
  });

  it("re-reads the actor and refuses a role that changed", async () => {
    state.rows.users = [person(ana, "LEARNER")];
    await expect(
      createBank(ana, { name: "Fire Safety", tags: [] }),
    ).rejects.toThrow("Not authorized to manage questions.");
    expect(state.inserts).toEqual([]);
  });
});

describe("createQuestion", () => {
  beforeEach(() => {
    state.rows.question_banks = [{ id: "bank" }];
  });

  it("refuses a bank that a live course draws from at random, naming only live courses", async () => {
    state.rows.lessons = [
      quiz({ ...course("fire", "PUBLISHED", "APPROVED"), title: "Fire Safety" }, [
        { bankId: "bank", pickN: 3 },
      ]),
      quiz({ ...course("old", "ARCHIVED", "APPROVED"), title: "Old Fire Safety" }, [
        { bankId: "bank", pickN: 3 },
      ]),
    ];
    await expect(createQuestion(ana, "bank", draft)).rejects.toThrow(
      "This bank feeds live training (Fire Safety). Choose another bank or create a new one.",
    );
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("refuses when a course turns out to be live once it is locked", async () => {
    state.rows.lessons = [quiz(course("fire"), [{ bankId: "bank", pickN: 3 }])];
    state.rows.courses = courseRows(course("fire", "PUBLISHED", "APPROVED"));
    await expect(createQuestion(ana, "bank", draft)).rejects.toThrow(
      "This bank feeds live training (Course fire). Choose another bank or create a new one.",
    );
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("reopens draft courses that draw from the bank and stores an approved question", async () => {
    state.rows.lessons = [quiz(course("draft"), [{ bankId: "bank", pickN: 2 }])];
    state.rows.courses = courseRows(course("draft"));
    const { id: questionId, bumpedCourseIds } = await createQuestion(ana, "bank", draft);
    expect(bumpedCourseIds).toEqual(["draft"]);
    expect(locks()).toEqual(["assessment", "curriculum:draft"]);
    expect(written("courses")).toEqual([bump]);
    expect(state.inserts).toEqual([
      {
        table: "questions",
        values: {
          id: questionId,
          bankId: "bank",
          type: "truefalse",
          points: 2,
          body: draft.body,
          rubric: null,
          status: "APPROVED",
          createdBy: "human",
          authorId: "ana",
        },
      },
    ]);
  });

  it("ignores picked questions, other banks and draws without a count", async () => {
    const live = course("live", "PUBLISHED", "APPROVED");
    state.rows.lessons = [
      quiz(live, [
        { fixed: ["old-question"] },
        { bankId: "other-bank", pickN: 2 },
        { bankId: "bank" },
      ]),
    ];
    expect((await createQuestion(ana, "bank", draft)).bumpedCourseIds).toEqual([]);
    expect(locks()).toEqual(["assessment"]);
    expect(written("courses")).toEqual([]);
    expect(state.inserts).toHaveLength(1);
  });

  it("takes approval away from an archived course that draws from the bank, keeping it archived", async () => {
    state.rows.lessons = [
      quiz(course("old", "ARCHIVED", "APPROVED"), [{ bankId: "bank", pickN: 2 }]),
    ];
    state.rows.courses = courseRows(course("old", "ARCHIVED", "APPROVED"));
    expect((await createQuestion(ana, "bank", draft)).bumpedCourseIds).toEqual(["old"]);
    expect(locks()).toEqual(["assessment", "curriculum:old"]);
    // No status field: the course stays ARCHIVED but needs a fresh approval.
    expect(written("courses")).toEqual([bump]);
    expect(state.inserts).toHaveLength(1);
  });

  it("refuses a Department Head", async () => {
    const head: Actor = { id: "head", role: "DEPARTMENT_HEAD", departmentId: "ops" };
    state.rows.users = [person(head)];
    await expect(createQuestion(head, "bank", draft)).rejects.toThrow(
      "Not authorized to manage questions.",
    );
    expect(state.inserts).toEqual([]);
  });

  it("refuses a bank that does not exist", async () => {
    state.rows.question_banks = [];
    await expect(createQuestion(ana, "missing", draft)).rejects.toThrow(
      "Choose a question bank.",
    );
    expect(state.inserts).toEqual([]);
  });
});

describe("editQuestion", () => {
  const question = {
    id: "q1",
    bankId: "bank",
    status: "APPROVED",
    authorId: "ana",
    version: 3,
    type: "mcq_single",
    points: 1,
    body: { prompt: "Old", options: ["a", "b"], correct: [0] },
    rubric: null,
  };
  beforeEach(() => {
    state.rows.questions = [question];
    state.rows.attempts = [{ count: 0 }];
    state.rows.lessons = [];
  });

  it("refuses another instructor's question", async () => {
    const ben: Actor = { id: "ben", role: "INSTRUCTOR", departmentId: null };
    state.rows.users = [person(ben)];
    await expect(editQuestion(ben, "q1", draft)).rejects.toThrow(
      "Only the author, HR Head or Admin can edit this question.",
    );
    expect(state.updates).toEqual([]);
  });

  it("lets an instructor who teaches the bank's course edit a question with no recorded author", async () => {
    state.rows.questions = [{ ...question, authorId: null }];
    state.rows.question_banks = [{ instructorId: "ana", departmentId: null }];
    await editQuestion(ana, "q1", draft);
    expect(written("questions")).toHaveLength(1);
    const ben: Actor = { id: "ben", role: "INSTRUCTOR", departmentId: null };
    state.rows.users = [person(ben)];
    state.updates = [];
    await expect(editQuestion(ben, "q1", draft)).rejects.toThrow(
      "Only the author, HR Head or Admin can edit this question.",
    );
    expect(state.updates).toEqual([]);
  });

  it("refuses a question learners have answered, counted by served-item containment", async () => {
    state.rows.attempts = [{ count: 2 }];
    await expect(editQuestion(ana, "q1", draft)).rejects.toThrow(
      "Learners have already answered this question. Copy it to make changes.",
    );
    const served = toQuery(state.wheres.find((w) => w.table === "attempts")?.where);
    expect(served.sql).toContain('"attempts"."served_items" @> $1::jsonb');
    expect(served.params).toEqual(['[{"questionId":"q1"}]']);
    expect(state.updates).toEqual([]);
  });

  it("refuses a question live training picks or draws", async () => {
    state.rows.lessons = [
      quiz({ ...course("fire", "PUBLISHED", "APPROVED"), title: "Fire Safety" }, [
        { fixed: ["q1"] },
      ]),
      quiz({ ...course("lift", "DRAFT", "SUBMITTED"), title: "Forklift" }, [
        { bankId: "bank", pickN: 1 },
      ]),
      quiz({ ...course("old", "ARCHIVED", "APPROVED"), title: "Old Fire Safety" }, [
        { fixed: ["q1"] },
      ]),
    ];
    await expect(editQuestion(ana, "q1", draft)).rejects.toThrow(
      "Used by live training: Fire Safety, Forklift. Copy it to make changes.",
    );
    expect(state.updates).toEqual([]);
  });

  it("only edits approved questions", async () => {
    state.rows.questions = [{ ...question, status: "DRAFT" }];
    await expect(editQuestion(ana, "q1", draft)).rejects.toThrow(
      "Only approved questions can be edited here.",
    );
    state.rows.questions = [];
    await expect(editQuestion(ana, "q1", draft)).rejects.toThrow(
      "Only approved questions can be edited here.",
    );
    expect(state.updates).toEqual([]);
  });

  it("takes approval away from an archived course that picks the question, keeping it archived", async () => {
    state.rows.lessons = [
      quiz(course("old", "ARCHIVED", "APPROVED"), [{ fixed: ["q1"] }]),
    ];
    state.rows.courses = courseRows(course("old", "ARCHIVED", "APPROVED"));
    await editQuestion(ana, "q1", draft);
    expect(locks()).toEqual(["assessment", "curriculum:old"]);
    // No status field: the course stays ARCHIVED but needs a fresh approval.
    expect(written("courses")).toEqual([bump]);
    expect(written("questions")).toHaveLength(1);
  });

  it("refuses when a referencing course turns out to be live once it is locked", async () => {
    state.rows.lessons = [quiz(course("fire"), [{ fixed: ["q1"] }])];
    state.rows.courses = courseRows(course("fire", "DRAFT", "SUBMITTED"));
    await expect(editQuestion(ana, "q1", draft)).rejects.toThrow(
      "Used by live training: Course fire. Copy it to make changes.",
    );
    expect(state.updates).toEqual([]);
  });

  it("revises referencing draft and archived courses in one lock order, then saves the next version", async () => {
    state.rows.lessons = [
      quiz(course("b"), [{ bankId: "bank", pickN: 2 }]),
      quiz(course("a"), [{ fixed: ["q1"] }]),
      quiz(course("a2", "ARCHIVED", "APPROVED"), [{ fixed: ["q1"] }]),
      quiz(course("other", "PUBLISHED", "APPROVED"), [
        { fixed: ["q2"] },
        { bankId: "other-bank", pickN: 1 },
      ]),
    ];
    state.rows.courses = courseRows(
      course("a"),
      course("a2", "ARCHIVED", "APPROVED"),
      course("b"),
    );
    await editQuestion(ana, "q1", draft);
    expect(locks()).toEqual([
      "assessment",
      "curriculum:a",
      "curriculum:a2",
      "curriculum:b",
    ]);
    expect(written("courses")).toEqual([bump, bump, bump]);
    expect(written("questions")).toEqual([
      { type: "truefalse", points: 2, body: draft.body, rubric: null, version: 4 },
    ]);
  });
});

describe("removeQuestion", () => {
  const question = { id: "q1", bankId: "bank", status: "APPROVED", authorId: "ana" };
  beforeEach(() => {
    state.rows.questions = [question];
    state.rows.lessons = [];
  });

  it("refuses another instructor's question", async () => {
    const ben: Actor = { id: "ben", role: "INSTRUCTOR", departmentId: null };
    state.rows.users = [person(ben)];
    await expect(removeQuestion(ben, "q1")).rejects.toThrow(
      "Only the author, HR Head or Admin can remove this question.",
    );
    expect(state.updates).toEqual([]);
  });

  it("refuses while a draft quiz still picks it", async () => {
    state.rows.lessons = [quiz(course("a"), [{ fixed: ["q1"] }])];
    await expect(removeQuestion(ana, "q1")).rejects.toThrow(
      "Picked in Course a · Quiz a. Take it out of those quizzes first.",
    );
    expect(state.updates).toEqual([]);
  });

  it("refuses while live training draws from its bank", async () => {
    state.rows.lessons = [
      quiz({ ...course("fire", "PUBLISHED", "APPROVED"), title: "Fire Safety" }, [{ bankId: "bank", pickN: 1 }]),
    ];
    await expect(removeQuestion(ana, "q1")).rejects.toThrow(
      "Used by live training: Fire Safety. It can't be removed while learners can get it.",
    );
    expect(state.updates).toEqual([]);
  });

  it("refuses while a live course picks it", async () => {
    state.rows.lessons = [
      quiz({ ...course("fire", "DRAFT", "APPROVED"), title: "Fire Safety" }, [{ fixed: ["q1"] }]),
    ];
    await expect(removeQuestion(ana, "q1")).rejects.toThrow(
      "Used by live training: Fire Safety. It can't be removed while learners can get it.",
    );
    expect(state.updates).toEqual([]);
  });

  it("refuses when a drawing course turns out to be live once it is locked", async () => {
    state.rows.lessons = [quiz(course("b"), [{ bankId: "bank", pickN: 1 }])];
    state.rows.courses = courseRows(course("b", "DRAFT", "SUBMITTED"));
    await expect(removeQuestion(ana, "q1")).rejects.toThrow(
      "Used by live training: Course b. It can't be removed while learners can get it.",
    );
    expect(state.updates).toEqual([]);
  });

  it("only removes approved questions", async () => {
    state.rows.questions = [{ ...question, status: "DRAFT" }];
    await expect(removeQuestion(ana, "q1")).rejects.toThrow("Only approved questions can be removed here.");
    expect(state.updates).toEqual([]);
  });

  it("revises courses drawing from the bank and archived courses picking it, then retires it", async () => {
    state.rows.lessons = [
      quiz(course("b"), [{ bankId: "bank", pickN: 2 }]),
      quiz(course("old", "ARCHIVED", "APPROVED"), [{ fixed: ["q1"] }]),
    ];
    state.rows.courses = courseRows(course("b"), course("old", "ARCHIVED", "APPROVED"));
    await removeQuestion(ana, "q1");
    expect(locks()).toEqual(["assessment", "curriculum:b", "curriculum:old"]);
    expect(written("courses")).toEqual([bump, bump]);
    expect(written("questions")).toEqual([{ status: "RETIRED" }]);
    // Learners having answered it does not matter: attempts are never read.
    expect(state.wheres.some((w) => w.table === "attempts")).toBe(false);
  });

  it("lets the course team remove a question with no recorded author", async () => {
    state.rows.questions = [{ ...question, authorId: null }];
    state.rows.question_banks = [{ instructorId: "ana", departmentId: null }];
    await removeQuestion(ana, "q1");
    expect(written("questions")).toEqual([{ status: "RETIRED" }]);
  });
});

describe("reopenDraftCourses", () => {
  it("locks each course once, in id order, and starts a new revision", async () => {
    state.rows.courses = courseRows(course("a"), course("b"));
    await reopenDraftCourses(db as never, ["b", "a", "b"]);
    expect(locks()).toEqual(["curriculum:a", "curriculum:b"]);
    expect(written("courses")).toEqual([bump, bump]);
  });

  it("refuses a submitted course", async () => {
    state.rows.courses = courseRows(course("a", "DRAFT", "SUBMITTED"));
    await expect(reopenDraftCourses(db as never, ["a"])).rejects.toThrow(
      "Revise affected courses before changing their assessment questions. Approval is currently locked.",
    );
    expect(state.updates).toEqual([]);
  });
});

describe("updateDraftQuestion", () => {
  it("reopens courses that use the question or own its bank before approving it", async () => {
    const admin: Actor = { id: "it", role: "ADMIN", departmentId: null };
    state.rows.users = [person(admin)];
    state.rows.questions = [{ id: "q1", bankId: "bank", status: "DRAFT" }];
    state.rows.question_banks = [{ id: "bank", courseId: "owner" }];
    state.rows.lessons = [{ courseId: "user" }, { courseId: "owner" }];
    state.rows.courses = courseRows(course("owner"), course("user"));
    await updateDraftQuestion(admin, "q1", "APPROVED");
    expect(locks()).toEqual(["assessment", "curriculum:owner", "curriculum:user"]);
    expect(written("courses")).toEqual([bump, bump]);
    expect(written("questions")).toEqual([{ status: "APPROVED" }]);
  });

  it("lets an instructor review a draft only their own courses use", async () => {
    state.rows.questions = [{ id: "q1", bankId: "bank", status: "DRAFT" }];
    state.rows.question_banks = [{ id: "bank", courseId: null }];
    state.rows.lessons = [{ courseId: "mine" }];
    state.rows.courses = () => [{ ...course("mine"), contentRevision: 4, instructorId: "ana" }];
    await updateDraftQuestion(ana, "q1", "RETIRED");
    expect(written("courses")).toEqual([bump]);
    expect(written("questions")).toEqual([{ status: "RETIRED" }]);
  });

  it("refuses an instructor when another instructor's course owns the bank, even if only their quizzes draw from it", async () => {
    state.rows.questions = [{ id: "q1", bankId: "bank", status: "DRAFT" }];
    state.rows.question_banks = [{ id: "bank", courseId: "bens" }];
    state.rows.lessons = [{ courseId: "mine" }];
    const queue = [
      { ...course("bens"), contentRevision: 4, instructorId: "ben" },
      { ...course("mine"), contentRevision: 4, instructorId: "ana" },
    ];
    state.rows.courses = () => [queue.shift()];
    await expect(updateDraftQuestion(ana, "q1", "APPROVED")).rejects.toThrow(
      "Not authorized to review questions.",
    );
    expect(state.updates).toEqual([]);
  });

  it("refuses an instructor when another instructor's course uses the bank, or no course does", async () => {
    state.rows.questions = [{ id: "q1", bankId: "bank", status: "DRAFT" }];
    state.rows.question_banks = [{ id: "bank", courseId: null }];
    state.rows.lessons = [{ courseId: "theirs" }];
    state.rows.courses = () => [{ ...course("theirs"), contentRevision: 4, instructorId: "ben" }];
    await expect(updateDraftQuestion(ana, "q1", "APPROVED")).rejects.toThrow(
      "Not authorized to review questions.",
    );
    state.rows.lessons = [];
    await expect(updateDraftQuestion(ana, "q1", "APPROVED")).rejects.toThrow(
      "Not authorized to review questions.",
    );
    expect(state.updates).toEqual([]);
  });
});

describe("reviewableDraftBankIds", () => {
  it("keeps banks used or owned only by the instructor's unsubmitted draft courses", async () => {
    const draftBy = (instructorId: string) => ({ instructorId, status: "DRAFT", approvalState: "DRAFT" });
    state.rows.lessons = [
      { ...draftBy("ana"), sections: [{ bankId: "mine", pickN: 2 }, { bankId: "shared", pickN: 1 }, { fixed: ["q"] }] },
      { ...draftBy("ben"), sections: [{ bankId: "shared", pickN: 1 }] },
      // A section naming a bank counts even without a count, as on the server.
      { ...draftBy("ben"), sections: [{ bankId: "named" }] },
      { ...draftBy("ana"), sections: [{ bankId: "named", pickN: 1 }] },
      // A live course's bank cannot change without re-approval, so its drafts are not offered.
      { instructorId: "ana", status: "PUBLISHED", approvalState: "APPROVED", sections: [{ bankId: "live", pickN: 1 }] },
      { instructorId: "ana", status: "DRAFT", approvalState: "SUBMITTED", sections: [{ bankId: "submitted", pickN: 1 }] },
    ];
    state.rows.question_banks = [
      { bankId: "owned", ...draftBy("ana") },
      { bankId: "mine", ...draftBy("ana") },
      { bankId: "theirs", ...draftBy("ben") },
    ];
    expect(await reviewableDraftBankIds(ana, db as never)).toEqual(["mine", "owned"]);
  });

  it("is empty for HR Head and Admin, who review drafts in Assessment reviews", async () => {
    const hr: Actor = { id: "hr", role: "HR_HEAD", departmentId: null };
    expect(await reviewableDraftBankIds(hr, db as never)).toEqual([]);
    expect(state.wheres).toEqual([]);
  });
});

describe("liveExamBankIds", () => {
  it("marks banks holding an approved question that a live exam picks or draws", async () => {
    state.rows.questions = [
      { id: "q1", bankId: "drawn" },
      { id: "q2", bankId: "picked" },
      { id: "q3", bankId: "practice" },
      { id: "q4", bankId: "draft-exam" },
    ];
    state.rows.lessons = [
      quiz(course("live", "PUBLISHED", "APPROVED"), [{ fixed: ["q2"] }, { bankId: "drawn", pickN: 2 }], "EXAM"),
      quiz(course("practice", "PUBLISHED", "APPROVED"), [{ bankId: "practice", pickN: 1 }]),
      quiz(course("draft"), [{ bankId: "draft-exam", pickN: 1 }], "EXAM"),
    ];
    expect(
      await liveExamBankIds(["drawn", "picked", "practice", "draft-exam"], db as never),
    ).toEqual(new Set(["drawn", "picked"]));
    const [bankQuery] = state.wheres.filter((w) => w.table === "questions").map((w) => toQuery(w.where));
    expect(bankQuery.params).toEqual(
      expect.arrayContaining(["drawn", "picked", "practice", "draft-exam", "APPROVED"]),
    );
  });

  it("reads nothing for no banks", async () => {
    expect(await liveExamBankIds([], db as never)).toEqual(new Set());
    expect(state.wheres).toEqual([]);
  });
});
