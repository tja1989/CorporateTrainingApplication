import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  user: { id: "u1", role: "INSTRUCTOR", departmentId: "d1" } as { id: string; role: string; departmentId: string | null },
  requirePermission: vi.fn(),
  createBank: vi.fn(),
  createQuestion: vi.fn(),
  editQuestion: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/guard", () => ({ requirePermission: m.requirePermission }));
vi.mock("@/lib/questions/bank", () => ({
  createBank: m.createBank,
  createQuestion: m.createQuestion,
  editQuestion: m.editQuestion,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { createBankAction, createQuestionAction, editQuestionAction } from "../lib/questions/actions";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};
const mcp: [string, string][] = [
  ["bankId", "b1"], ["type", "mcq_single"], ["prompt", "Pick one"], ["points", "2"],
  ["option", "A"], ["option", "B"], ["correct", "1"],
];

beforeEach(() => {
  vi.clearAllMocks();
  m.user = { id: "u1", role: "INSTRUCTOR", departmentId: "d1" };
  m.requirePermission.mockImplementation(async () => m.user);
});

describe("question bank actions", () => {
  it("rejects an empty prompt without calling the service", async () => {
    const r = await createQuestionAction(form([["bankId", "b1"], ["type", "mcq_single"], ["prompt", " "]]));
    expect(r).toEqual({ error: "Enter the question." });
    expect(m.createQuestion).not.toHaveBeenCalled();
  });

  it("returns the live-bank error from the service", async () => {
    m.createQuestion.mockRejectedValue(new Error("This bank feeds live training (Safety). Choose another bank or create a new one."));
    const r = await createQuestionAction(form(mcp));
    expect(r).toEqual({ error: "This bank feeds live training (Safety). Choose another bank or create a new one." });
  });

  it("creates with the server-derived actor and links to the new question", async () => {
    m.createQuestion.mockResolvedValue("q9");
    const r = await createQuestionAction(form([...mcp, ["actor", "evil"], ["role", "ADMIN"]]));
    expect(r).toEqual({ href: "/instructor/questions?question=q9" });
    expect(m.createQuestion).toHaveBeenCalledWith(
      { id: "u1", role: "INSTRUCTOR", departmentId: "d1" },
      "b1",
      expect.objectContaining({ type: "mcq_single", points: 2, body: expect.objectContaining({ options: ["A", "B"], correct: [1] }) }),
    );
    for (const p of ["/admin/questions", "/hr/questions", "/instructor/questions"]) expect(m.revalidatePath).toHaveBeenCalledWith(p);
  });

  it("uses the role's own bank path", async () => {
    m.user = { id: "h1", role: "HR_HEAD", departmentId: null };
    m.createQuestion.mockResolvedValue("q1");
    expect(await createQuestionAction(form(mcp))).toEqual({ href: "/hr/questions?question=q1" });
  });

  it("editQuestionAction returns the block reason as error", async () => {
    m.editQuestion.mockRejectedValue(new Error("Learners have already answered this question. Copy it to make changes."));
    const r = await editQuestionAction("q1", form(mcp));
    expect(r).toEqual({ error: "Learners have already answered this question. Copy it to make changes." });
  });

  it("editQuestionAction ignores bankId and returns the bank href", async () => {
    m.editQuestion.mockResolvedValue(undefined);
    const r = await editQuestionAction("q1", form(mcp));
    expect(r).toEqual({ href: "/instructor/questions?question=q1" });
    expect(m.editQuestion).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), "q1", expect.not.objectContaining({ bankId: expect.anything() }));
  });

  it("createBankAction splits, trims and drops empty tags", async () => {
    m.createBank.mockResolvedValue("b2");
    const r = await createBankAction(form([["name", "Safety"], ["tags", " fire, , exits ,"]]));
    expect(r).toEqual({ success: "Bank created." });
    expect(m.createBank).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), { name: "Safety", tags: ["fire", "exits"] });
  });

  it("returns bank errors", async () => {
    m.createBank.mockRejectedValue(new Error("A bank with this name already exists."));
    expect(await createBankAction(form([["name", "x"], ["tags", ""]]))).toEqual({ error: "A bank with this name already exists." });
  });

  it("calls no service when the permission check redirects", async () => {
    m.requirePermission.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(createQuestionAction(form(mcp))).rejects.toThrow("NEXT_REDIRECT");
    await expect(editQuestionAction("q1", form(mcp))).rejects.toThrow("NEXT_REDIRECT");
    await expect(createBankAction(form([["name", "x"]]))).rejects.toThrow("NEXT_REDIRECT");
    expect(m.createQuestion).not.toHaveBeenCalled();
    expect(m.editQuestion).not.toHaveBeenCalled();
    expect(m.createBank).not.toHaveBeenCalled();
  });
});
