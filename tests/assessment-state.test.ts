import { describe, expect, it, vi } from "vitest";
import { isAnswered, saveAttemptAnswers, submitSavedAttempt, resultStatus } from "@/lib/quiz/client-state";

describe("assessment answer and finality states", () => {
  it("does not count cleared or incomplete answers as answered", () => {
    expect(isAnswered({ type: "free_text" }, { kind: "text", text: "  " })).toBe(false);
    expect(isAnswered({ type: "mcq_multi" }, { kind: "choice", selected: [] })).toBe(false);
    expect(isAnswered({ type: "matching", left: ["a", "b"] }, { kind: "matching", pairs: { 0: 0 } })).toBe(false);
    expect(isAnswered({ type: "ordering", orderItems: ["a", "b"] }, { kind: "ordering", order: [0, 1] })).toBe(true);
  });
  it("never presents a pending or provisional result as final pass", () => {
    expect(resultStatus({ gradingState: "PROVISIONAL", state: "SUBMITTED", passed: true })).toBe("pending");
    expect(resultStatus({ gradingState: "FINAL", state: "SUBMITTED", passed: null })).toBe("pending");
    expect(resultStatus({ gradingState: "FINAL", state: "GRADED", passed: false })).toBe("fail");
  });
  it("does not mark a rejected save as saved", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Try again" }), { status: 503 }));
    await expect(saveAttemptAnswers("a", {}, [], fetcher)).rejects.toThrow("Try again");
  });
  it("does not submit stale answers after save fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(submitSavedAttempt("a", {}, [], fetcher)).rejects.toThrow("offline");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retrieves an already auto-submitted result after the server deadline response", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ submitted: true }), { status: 409 })).mockResolvedValueOnce(new Response(JSON.stringify({ state: "GRADED" })));
    expect(await submitSavedAttempt("a", {}, [], fetcher)).toEqual({ state: "GRADED" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
