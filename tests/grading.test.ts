import { describe, expect, it } from "vitest";
import { gradeRouting } from "@/lib/quiz/grading";

describe("grade routing (spec FR-6.10 — employment-safe)", () => {
  it("every AI fail on required completion goes to a human, even at full confidence", () => {
    expect(gradeRouting({ finalPct: 20, passPct: 70, confidence: 0.99, gatesRequiredCompletion: true })).toEqual({
      finalize: false,
      reason: "ai_fail",
    });
  });
  it("confident clear pass auto-finalizes", () => {
    expect(gradeRouting({ finalPct: 90, passPct: 70, confidence: 0.9, gatesRequiredCompletion: true })).toEqual({
      finalize: true,
      reason: null,
    });
  });
  it("low confidence routes even a clear pass", () => {
    expect(gradeRouting({ finalPct: 95, passPct: 70, confidence: 0.5, gatesRequiredCompletion: true }).finalize).toBe(false);
  });
  it("borderline pass (±5pp) routes to a human", () => {
    expect(gradeRouting({ finalPct: 73, passPct: 70, confidence: 0.95, gatesRequiredCompletion: true }).reason).toBe("borderline");
  });
  it("non-gating fail can finalize when confident and not borderline", () => {
    expect(gradeRouting({ finalPct: 40, passPct: 70, confidence: 0.9, gatesRequiredCompletion: false }).finalize).toBe(true);
  });
});
