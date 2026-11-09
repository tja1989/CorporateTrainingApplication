import { describe, expect, it } from "vitest";
import type { Actor } from "../lib/auth/roles";
import {
  canManageQuestion,
  editBlockReason,
  isDraftCourse,
  isLiveCourse,
  removeBlockReason,
} from "../lib/questions/rules";

const ana: Actor = { id: "ana", role: "INSTRUCTOR", departmentId: null };
const ben: Actor = { id: "ben", role: "INSTRUCTOR", departmentId: null };
const hrHead: Actor = { id: "hr", role: "HR_HEAD", departmentId: null };
const admin: Actor = { id: "it", role: "ADMIN", departmentId: null };

describe("isLiveCourse", () => {
  it.each([
    ["PUBLISHED", "APPROVED", true],
    ["PUBLISHED", "LEGACY_PUBLISHED", true],
    ["DRAFT", "SUBMITTED", true],
    ["DRAFT", "APPROVED", true],
    ["DRAFT", "DRAFT", false],
    ["DRAFT", "REJECTED", false],
    ["ARCHIVED", "DRAFT", false],
    ["ARCHIVED", "APPROVED", false],
  ])("a %s course with approval %s is live: %s", (status, approvalState, live) => {
    expect(isLiveCourse({ status, approvalState })).toBe(live);
  });
});

describe("isDraftCourse", () => {
  it.each([
    ["DRAFT", "DRAFT", true],
    ["DRAFT", "REJECTED", true],
    ["DRAFT", "SUBMITTED", false],
    ["DRAFT", "APPROVED", false],
    ["PUBLISHED", "APPROVED", false],
    ["ARCHIVED", "DRAFT", false],
  ])("a %s course with approval %s is a draft: %s", (status, approvalState, draft) => {
    expect(isDraftCourse({ status, approvalState })).toBe(draft);
  });
});

describe("editBlockReason", () => {
  const editable = {
    actor: ana,
    authorId: "ana",
    servedCount: 0,
    liveCourseTitles: [] as string[],
  };

  it("lets the author edit an unanswered question no live training uses", () => {
    expect(editBlockReason(editable)).toBeNull();
  });

  it("lets HR Head edit someone else's question", () => {
    expect(editBlockReason({ ...editable, actor: hrHead })).toBeNull();
  });

  it("lets Admin edit starter or AI content that has no author", () => {
    expect(
      editBlockReason({ ...editable, actor: admin, authorId: null }),
    ).toBeNull();
  });

  it("refuses another instructor before any other reason", () => {
    expect(
      editBlockReason({
        ...editable,
        actor: ben,
        servedCount: 4,
        liveCourseTitles: ["Fire Safety"],
      }),
    ).toBe("Only the author, HR Head or Admin can edit this question.");
  });

  it("refuses an instructor on a question with no author", () => {
    expect(editBlockReason({ ...editable, authorId: null })).toBe(
      "Only the author, HR Head or Admin can edit this question.",
    );
  });

  it("refuses an answered question before naming live training", () => {
    expect(
      editBlockReason({
        ...editable,
        servedCount: 1,
        liveCourseTitles: ["Fire Safety"],
      }),
    ).toBe(
      "Learners have already answered this question. Copy it to make changes.",
    );
  });

  it("names every live course that uses the question", () => {
    expect(
      editBlockReason({
        ...editable,
        actor: hrHead,
        liveCourseTitles: ["Fire Safety", "Forklift Basics"],
      }),
    ).toBe(
      "Used by live training: Fire Safety, Forklift Basics. Copy it to make changes.",
    );
  });
});

describe("canManageQuestion", () => {
  it("lets the author, HR Head and Admin manage a question", () => {
    expect(canManageQuestion({ actor: ana, authorId: "ana" })).toBe(true);
    expect(canManageQuestion({ actor: ben, authorId: "ana" })).toBe(false);
    expect(canManageQuestion({ actor: hrHead, authorId: "ana" })).toBe(true);
    expect(canManageQuestion({ actor: admin, authorId: null })).toBe(true);
  });

  it("lets the course team manage only questions with no recorded author", () => {
    expect(canManageQuestion({ actor: ben, authorId: null, courseTeam: true })).toBe(true);
    expect(canManageQuestion({ actor: ben, authorId: null, courseTeam: false })).toBe(false);
    expect(canManageQuestion({ actor: ben, authorId: "ana", courseTeam: true })).toBe(false);
  });

  it("applies the course-team rule to edits", () => {
    const base = { servedCount: 0, liveCourseTitles: [] };
    expect(editBlockReason({ ...base, actor: ben, authorId: null, courseTeam: true })).toBeNull();
    expect(editBlockReason({ ...base, actor: ben, authorId: null })).toBe(
      "Only the author, HR Head or Admin can edit this question.",
    );
  });
});

describe("removeBlockReason", () => {
  const base = { actor: ana, authorId: "ana", pickedIn: [] as string[], liveCourseTitles: [] as string[] };
  it("allows the author when nothing picks it and no live training uses it", () => {
    expect(removeBlockReason(base)).toBeNull();
  });

  it("checks who is removing first, then live training, then picks", () => {
    const busy = { ...base, pickedIn: ["Fire · Drill"], liveCourseTitles: ["Forklift"] };
    expect(removeBlockReason({ ...busy, actor: ben })).toBe(
      "Only the author, HR Head or Admin can remove this question.",
    );
    expect(removeBlockReason(busy)).toBe(
      "Used by live training: Forklift. It can't be removed while learners can get it.",
    );
    expect(removeBlockReason({ ...busy, liveCourseTitles: [] })).toBe(
      "Picked in Fire · Drill. Take it out of those quizzes first.",
    );
  });
});
