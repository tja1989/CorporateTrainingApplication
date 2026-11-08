import { describe, expect, it } from "vitest";
import {
  draftToFormDefaults,
  parseQuestionForm,
  type QuestionDraft,
} from "@/lib/questions/validate";

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) f.append(k, item);
  }
  return f;
}

function ok(fields: Record<string, string | string[]>): QuestionDraft {
  const r = parseQuestionForm(form(fields));
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.value;
}

function err(fields: Record<string, string | string[]>): string {
  const r = parseQuestionForm(form(fields));
  if (r.ok) throw new Error("expected an error");
  return r.error;
}

const mcq = { type: "mcq_single", prompt: "Pick one", option: ["A", "B", "C"], correct: ["1"] };

describe("parseQuestionForm valid input", () => {
  it("parses single choice with locked options", () => {
    expect(ok({ ...mcq, option: ["A", "B", "All of the above"], locked: ["2"], points: "2" })).toEqual({
      type: "mcq_single",
      points: 2,
      body: { prompt: "Pick one", options: ["A", "B", "All of the above"], correct: [1], lockedOptionIndices: [2] },
      rubric: null,
    });
  });
  it("omits lockedOptionIndices, stimulus and explanation when empty; points default to 1", () => {
    const d = ok(mcq);
    expect(d.points).toBe(1);
    expect(d.body).toEqual({ prompt: "Pick one", options: ["A", "B", "C"], correct: [1] });
    expect("lockedOptionIndices" in d.body).toBe(false);
  });
  it("parses multiple choice with scenario and explanation", () => {
    expect(
      ok({ ...mcq, type: "mcq_multi", correct: ["0", "2"], stimulus: " Scenario ", explanation: " Why " }),
    ).toEqual({
      type: "mcq_multi",
      points: 1,
      body: { prompt: "Pick one", stimulus: "Scenario", options: ["A", "B", "C"], correct: [0, 2], explanation: "Why" },
      rubric: null,
    });
  });
  it("parses true/false as [0] and [1] without options", () => {
    const t = ok({ type: "truefalse", prompt: "Sky is blue", truefalse: "true" });
    expect(t.body).toEqual({ prompt: "Sky is blue", correct: [0] });
    expect(ok({ type: "truefalse", prompt: "x", truefalse: "false" }).body.correct).toEqual([1]);
  });
  it("parses fill in the blank", () => {
    expect(ok({ type: "fill_blank", prompt: "Capital of France is ___", accepted: [" Paris ", "", "paris"] }).body).toEqual({
      prompt: "Capital of France is ___",
      acceptedAnswers: ["Paris", "paris"],
    });
  });
  it("parses matching, dropping incomplete pairs", () => {
    expect(
      ok({ type: "matching", prompt: "Match", left: ["a", "b", "c"], right: ["1", "2", ""] }).body.pairs,
    ).toEqual([
      { left: "a", right: "1" },
      { left: "b", right: "2" },
    ]);
  });
  it("parses ordering", () => {
    expect(ok({ type: "ordering", prompt: "Order", orderItem: ["first", " ", "second", "third"] }).body.orderItems).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
  it("parses written answer into a rubric", () => {
    expect(
      ok({
        type: "free_text",
        prompt: "Explain",
        stimulus: "Case",
        criterionName: ["Clarity", "Accuracy", ""],
        criterionPoints: ["2", "3", ""],
        modelAnswer: " Model ",
        points: "5",
      }),
    ).toEqual({
      type: "free_text",
      points: 5,
      body: { prompt: "Explain", stimulus: "Case" },
      rubric: { criteria: [{ name: "Clarity", points: 2 }, { name: "Accuracy", points: 3 }], modelAnswer: "Model" },
    });
  });
});

describe("parseQuestionForm errors", () => {
  it("rejects an empty prompt", () => expect(err({ ...mcq, prompt: "  " })).toBe("Enter the question."));
  it("rejects an unknown type", () => {
    expect(err({ ...mcq, type: "essay" })).toBe("Choose a question type.");
    expect(err({ prompt: "x" })).toBe("Choose a question type.");
  });
  it("rejects bad points", () => {
    for (const p of ["0", "-1", "1.5", "abc"]) {
      expect(err({ ...mcq, points: p })).toBe("Points must be a whole number of 1 or more.");
    }
  });
  it("needs two options", () => expect(err({ ...mcq, option: ["A", ""], correct: ["0"] })).toBe("Add at least two answer choices."));
  it("single choice needs exactly one correct", () => {
    expect(err({ ...mcq, correct: [] })).toBe("Mark exactly one correct answer.");
    expect(err({ ...mcq, correct: ["0", "1"] })).toBe("Mark exactly one correct answer.");
  });
  it("multiple choice needs a correct answer", () => {
    expect(err({ ...mcq, type: "mcq_multi", correct: [] })).toBe("Mark at least one correct answer.");
  });
  it("rejects out of range correct index", () => {
    expect(err({ ...mcq, type: "mcq_multi", correct: ["7"] })).toBe("Mark at least one correct answer.");
  });
  it("true/false needs a choice", () => {
    expect(err({ type: "truefalse", prompt: "x" })).toBe("Choose whether the statement is true or false.");
  });
  it("fill blank needs an answer", () => expect(err({ type: "fill_blank", prompt: "x", accepted: [" "] })).toBe("Add at least one accepted answer."));
  it("matching needs two complete pairs", () => {
    expect(err({ type: "matching", prompt: "x", left: ["a", "b"], right: ["1", ""] })).toBe("Add at least two complete pairs.");
  });
  it("ordering needs two items", () => expect(err({ type: "ordering", prompt: "x", orderItem: ["one"] })).toBe("Add at least two steps in the correct order."));
  it("written answer needs valid criteria and a model answer", () => {
    const base = { type: "free_text", prompt: "x", modelAnswer: "m" };
    expect(err({ ...base })).toBe("Add at least one marking criterion with points.");
    expect(err({ ...base, criterionName: ["A"], criterionPoints: ["0"] })).toBe("Add at least one marking criterion with points.");
    expect(err({ ...base, criterionName: ["A"], criterionPoints: ["x"] })).toBe("Add at least one marking criterion with points.");
    expect(err({ type: "free_text", prompt: "x", criterionName: ["A"], criterionPoints: ["2"] })).toBe("Add a model answer.");
  });
});

describe("draftToFormDefaults round trip", () => {
  const drafts: QuestionDraft[] = [
    { type: "mcq_single", points: 2, body: { prompt: "p", stimulus: "s", options: ["A", "B", "All"], correct: [0], lockedOptionIndices: [2], explanation: "e" }, rubric: null },
    { type: "mcq_multi", points: 1, body: { prompt: "p", options: ["A", "B", "C"], correct: [0, 2] }, rubric: null },
    { type: "truefalse", points: 1, body: { prompt: "p", correct: [0] }, rubric: null },
    { type: "truefalse", points: 1, body: { prompt: "p", correct: [1] }, rubric: null },
    { type: "fill_blank", points: 3, body: { prompt: "p", acceptedAnswers: ["a", "b"] }, rubric: null },
    { type: "matching", points: 1, body: { prompt: "p", pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }] }, rubric: null },
    { type: "ordering", points: 1, body: { prompt: "p", orderItems: ["x", "y", "z"] }, rubric: null },
    { type: "free_text", points: 5, body: { prompt: "p", stimulus: "s", explanation: "e" }, rubric: { criteria: [{ name: "c", points: 5 }], modelAnswer: "m" } },
  ];
  for (const d of drafts) {
    it(`round-trips ${d.type}${d.type === "truefalse" ? ` ${d.body.correct}` : ""}`, () => {
      const r = parseQuestionForm(form(draftToFormDefaults(d)));
      expect(r).toEqual({ ok: true, value: d });
    });
  }
  it("emits truefalse as a string", () => {
    expect(draftToFormDefaults(drafts[2]).truefalse).toBe("true");
  });
});
