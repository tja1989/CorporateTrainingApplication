import { describe, expect, it } from "vitest";
import { parseQuestionInput } from "../lib/courses/question-input";

const base = { prompt: "Exit route?", options: ["Lift", "Stairs", "", ""], correct: ["1"], accepted: "", explanation: "" };

describe("instructor question input", () => {
  it("keeps filled options and maps the chosen answer onto them", () => {
    expect(parseQuestionInput({ ...base, type: "mcq_single", options: ["Lift", "", "Stairs"], correct: ["2"], explanation: " Never lifts. " })).toEqual({
      value: { type: "mcq_single", body: { prompt: "Exit route?", options: ["Lift", "Stairs"], correct: [1], explanation: "Never lifts." } },
    });
  });

  it("needs a prompt, two options and the right number of answers", () => {
    expect(parseQuestionInput({ ...base, type: "mcq_single", prompt: " " })).toEqual({ error: "Enter the question." });
    expect(parseQuestionInput({ ...base, type: "mcq_single", options: ["Lift", "", "", ""] })).toEqual({ error: "Add at least two answer options." });
    expect(parseQuestionInput({ ...base, type: "mcq_single", correct: [] })).toEqual({ error: "Choose the one correct answer." });
    expect(parseQuestionInput({ ...base, type: "mcq_single", correct: ["0", "1"] })).toEqual({ error: "Choose the one correct answer." });
    expect(parseQuestionInput({ ...base, type: "mcq_single", correct: ["3"] })).toEqual({ error: "Choose the one correct answer." });
  });

  it("accepts several correct answers for select-all questions", () => {
    const parsed = parseQuestionInput({ ...base, type: "mcq_multi", options: ["Before food", "After phone", "Never"], correct: ["0", "1"] });
    expect(parsed).toEqual({ value: { type: "mcq_multi", body: { prompt: "Exit route?", options: ["Before food", "After phone", "Never"], correct: [0, 1] } } });
    expect(parseQuestionInput({ ...base, type: "mcq_multi", correct: [] })).toEqual({ error: "Choose at least one correct answer." });
  });

  it("stores true/false as the app's fixed answer order", () => {
    expect(parseQuestionInput({ ...base, type: "truefalse", correct: ["false"] })).toEqual({ value: { type: "truefalse", body: { prompt: "Exit route?", correct: [1] } } });
    expect(parseQuestionInput({ ...base, type: "truefalse", correct: [] })).toEqual({ error: "Choose True or False." });
  });

  it("lists accepted typed answers one per line", () => {
    expect(parseQuestionInput({ ...base, type: "fill_blank", accepted: "20\n twenty \n\n" })).toEqual({ value: { type: "fill_blank", body: { prompt: "Exit route?", acceptedAnswers: ["20", "twenty"] } } });
    expect(parseQuestionInput({ ...base, type: "fill_blank", accepted: " " })).toEqual({ error: "Add at least one accepted answer." });
  });

  it("rejects question types instructors cannot write here", () => {
    expect(parseQuestionInput({ ...base, type: "free_text" })).toEqual({ error: "Choose a question type." });
  });
});
