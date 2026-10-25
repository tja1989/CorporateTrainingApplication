import { describe, expect, it } from "vitest";
import { parseQuizSettingsInput } from "../lib/courses/quiz-settings-input";

const base = { bankId: "b1", pickN: "3", passPct: "70", attemptsLimit: "", timeLimitMinutes: "", exam: false, integrity: false };

describe("quiz settings an author can change", () => {
  it("turns the form into stored settings", () => {
    expect(parseQuizSettingsInput({ ...base, attemptsLimit: "2", timeLimitMinutes: "10", exam: true })).toEqual({
      value: { bankId: "b1", pickN: 3, passPct: 70, attemptsLimit: 2, timeLimitSec: 600, feedbackMode: "EXAM", integrityMode: false },
    });
  });

  it("treats blank attempts and time as unlimited", () => {
    expect(parseQuizSettingsInput(base)).toMatchObject({ value: { attemptsLimit: null, timeLimitSec: null, feedbackMode: "PRACTICE" } });
  });

  it("rejects missing or out-of-range values", () => {
    expect(parseQuizSettingsInput({ ...base, bankId: "" })).toEqual({ error: "Choose a question bank." });
    expect(parseQuizSettingsInput({ ...base, pickN: "0" })).toMatchObject({ error: expect.stringContaining("Questions to draw") });
    expect(parseQuizSettingsInput({ ...base, pickN: "2.5" })).toMatchObject({ error: expect.stringContaining("Questions to draw") });
    expect(parseQuizSettingsInput({ ...base, passPct: "120" })).toMatchObject({ error: expect.stringContaining("Pass mark") });
    expect(parseQuizSettingsInput({ ...base, attemptsLimit: "0" })).toMatchObject({ error: expect.stringContaining("Attempts") });
    expect(parseQuizSettingsInput({ ...base, timeLimitMinutes: "500" })).toMatchObject({ error: expect.stringContaining("Time limit") });
  });
});
