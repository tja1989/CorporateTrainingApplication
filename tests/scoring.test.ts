import { describe, expect, it } from "vitest";
import { scoreQuestion, scoreQuiz, shuffleChoices, normalizeText } from "@/lib/quiz/scoring";

describe("per-type scoring (spec FR-6.7)", () => {
  it("mcq_single all-or-nothing", () => {
    const q = { type: "mcq_single" as const, points: 2, body: { prompt: "", options: ["a", "b"], correct: [1] } };
    expect(scoreQuestion(q, { kind: "choice", selected: [1] })).toBe(2);
    expect(scoreQuestion(q, { kind: "choice", selected: [0] })).toBe(0);
    expect(scoreQuestion(q, undefined)).toBe(0);
  });
  it("mcq_multi exact-set all-or-nothing", () => {
    const q = { type: "mcq_multi" as const, points: 1, body: { prompt: "", options: ["a", "b", "c", "d"], correct: [0, 2] } };
    expect(scoreQuestion(q, { kind: "choice", selected: [2, 0] })).toBe(1);
    expect(scoreQuestion(q, { kind: "choice", selected: [0] })).toBe(0);
    expect(scoreQuestion(q, { kind: "choice", selected: [0, 2, 3] })).toBe(0);
  });
  it("truefalse", () => {
    const q = { type: "truefalse" as const, points: 1, body: { prompt: "", correct: [1] } };
    expect(scoreQuestion(q, { kind: "choice", selected: [1] })).toBe(1);
    expect(scoreQuestion(q, { kind: "choice", selected: [0] })).toBe(0);
  });
  it("fill_blank case-insensitive trim-normalized", () => {
    const q = { type: "fill_blank" as const, points: 1, body: { prompt: "", acceptedAnswers: ["20 seconds", "twenty"] } };
    expect(scoreQuestion(q, { kind: "text", text: "  20   SECONDS " })).toBe(1);
    expect(scoreQuestion(q, { kind: "text", text: "TWENTY" })).toBe(1);
    expect(scoreQuestion(q, { kind: "text", text: "10" })).toBe(0);
  });
  it("matching proportional", () => {
    const q = {
      type: "matching" as const,
      points: 4,
      body: { prompt: "", pairs: [{ left: "L", right: "R" }, { left: "L2", right: "R2" }] },
    };
    expect(scoreQuestion(q, { kind: "matching", pairs: { 0: 0, 1: 1 } })).toBe(4);
    expect(scoreQuestion(q, { kind: "matching", pairs: { 0: 0, 1: 0 } })).toBe(2);
  });
  it("ordering proportional by position", () => {
    const q = { type: "ordering" as const, points: 3, body: { prompt: "", orderItems: ["a", "b", "c"] } };
    expect(scoreQuestion(q, { kind: "ordering", order: [0, 1, 2] })).toBe(3);
    expect(scoreQuestion(q, { kind: "ordering", order: [0, 2, 1] })).toBe(1);
  });
  it("free_text returns null (graded separately) and rubric normalizes into quiz totals", () => {
    const q = { type: "free_text" as const, points: 4, body: { prompt: "" } };
    expect(scoreQuestion(q, { kind: "text", text: "hi" })).toBeNull();
    const result = scoreQuiz([
      { questionId: "a", q: { type: "mcq_single", points: 1, body: { prompt: "", options: ["x", "y"], correct: [0] } }, answer: { kind: "choice", selected: [0] } },
      { questionId: "b", q, answer: { kind: "text", text: "hi" }, freeTextEarned: 3 },
    ]);
    expect(result.earned).toBe(4);
    expect(result.possible).toBe(5);
    expect(result.pct).toBe(80);
  });
  it("pending free text is reported, not scored", () => {
    const result = scoreQuiz([
      { questionId: "b", q: { type: "free_text", points: 4, body: { prompt: "" } }, answer: { kind: "text", text: "x" }, freeTextEarned: null },
    ]);
    expect(result.pendingFreeText).toEqual(["b"]);
  });
});

describe("choice shuffling honors locked positions (spec FR-6.4)", () => {
  it("keeps locked index in place", () => {
    for (let i = 0; i < 20; i++) {
      const order = shuffleChoices(4, [3]);
      expect(order[3]).toBe(3);
      expect([...order].sort()).toEqual([0, 1, 2, 3]);
    }
  });
});

describe("normalizeText", () => {
  it("collapses whitespace and case", () => {
    expect(normalizeText("  A  B ")).toBe("a b");
  });
});
