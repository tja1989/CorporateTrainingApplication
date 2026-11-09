import { describe, expect, it } from "vitest";
import { reviewItem } from "../lib/quiz/review";
import type { QuestionForScoring } from "../lib/quiz/scoring";

const q = (type: QuestionForScoring["type"], body: QuestionForScoring["body"]) => ({ id: "q1", type, points: 1, body });

describe("post-assessment answer review", () => {
  const mcq = q("mcq_single", { prompt: "Exit route?", options: ["Lift", "Stairs", "Window"], correct: [1], explanation: "Never use lifts." });

  it("marks the learner's wrong choice and reveals the right one when allowed", () => {
    const item = reviewItem(mcq, { kind: "choice", selected: [0] }, { reveal: true });
    expect(item.correct).toBe(false);
    expect(item.choices).toEqual([
      { label: "Lift", picked: true, correct: false },
      { label: "Stairs", picked: false, correct: true },
      { label: "Window", picked: false, correct: false },
    ]);
    expect(item.explanation).toBe("Never use lifts.");
  });

  it("shows right or wrong but keeps the answer key hidden on a closed exam", () => {
    const item = reviewItem(mcq, { kind: "choice", selected: [0] }, { reveal: false });
    expect(item.correct).toBe(false);
    expect(item.choices.map((c) => c.correct)).toEqual([null, null, null]);
    expect(item.choices[0].picked).toBe(true);
    expect(item.explanation).toBeNull();
    expect(item.correctAnswer).toEqual([]);
  });

  it("labels true/false choices and handles an unanswered question", () => {
    const item = reviewItem(q("truefalse", { prompt: "Gloves required?", correct: [0] }), undefined, { reveal: true });
    expect(item.correct).toBe(false);
    expect(item.choices).toEqual([
      { label: "True", picked: false, correct: true },
      { label: "False", picked: false, correct: false },
    ]);
    expect(item.yourAnswer).toEqual(["No answer"]);
  });

  it("lists typed, matched and ordered answers beside the key", () => {
    const blank = reviewItem(q("fill_blank", { prompt: "Wash for __ seconds", acceptedAnswers: ["20", "twenty"] }), { kind: "text", text: "20" }, { reveal: true });
    expect(blank).toMatchObject({ correct: true, yourAnswer: ["20"], correctAnswer: ["20"] });

    const pairs = [{ left: "Red", right: "Stop" }, { left: "Green", right: "Go" }];
    const match = reviewItem(q("matching", { prompt: "Match", pairs }), { kind: "matching", pairs: { 0: 1, 1: 0 } }, { reveal: true });
    expect(match).toMatchObject({ correct: false, yourAnswer: ["Red → Go", "Green → Stop"], correctAnswer: ["Red → Stop", "Green → Go"] });

    const order = reviewItem(q("ordering", { prompt: "Order", orderItems: ["Alarm", "Exit", "Assemble"] }), { kind: "ordering", order: [0, 1, 2] }, { reveal: false });
    expect(order).toMatchObject({ correct: true, yourAnswer: ["Alarm", "Exit", "Assemble"], correctAnswer: [] });
  });

  it("leaves AI-graded written answers undecided", () => {
    const item = reviewItem(q("free_text", { prompt: "Explain" }), { kind: "text", text: "Because" }, { reveal: true, rationale: "Covers the key point." });
    expect(item).toMatchObject({ correct: null, yourAnswer: ["Because"], rationale: "Covers the key point." });
  });
});
