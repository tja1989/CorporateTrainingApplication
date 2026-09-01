import { describe, expect, it } from "vitest";
import { canRevealAnswers, windowState, unmapAnswer, DEFAULT_SETTINGS } from "@/lib/quiz/engine";
import { verifyTotp, totpCode, generateTotpSecret } from "@/lib/auth/totp";

describe("exam windows + answer reveal (spec FR-6.4/6.6)", () => {
  const base = { ...DEFAULT_SETTINGS, feedbackMode: "EXAM" as const };
  const now = new Date("2026-09-01T12:00:00Z");
  it("EXAM hides answers while the window is open", () => {
    expect(canRevealAnswers({ ...base, availableUntil: "2026-09-02T00:00:00Z" }, now)).toBe(false);
  });
  it("EXAM reveals after the window closes", () => {
    expect(canRevealAnswers({ ...base, availableUntil: "2026-08-31T00:00:00Z" }, now)).toBe(true);
  });
  it("EXAM without a window reveals only on explicit release", () => {
    expect(canRevealAnswers(base, now)).toBe(false);
    expect(canRevealAnswers({ ...base, answersReleasedAt: "2026-09-01T00:00:00Z" }, now)).toBe(true);
  });
  it("PRACTICE always reveals", () => {
    expect(canRevealAnswers({ ...base, feedbackMode: "PRACTICE" }, now)).toBe(true);
  });
  it("window state transitions", () => {
    expect(windowState({ ...base, availableFrom: "2026-09-02T00:00:00Z" }, now)).toBe("before");
    expect(windowState({ ...base, availableUntil: "2026-08-31T00:00:00Z" }, now)).toBe("closed");
    expect(windowState(base, now)).toBe("open");
  });
});

describe("display→actual answer unmapping (shuffled choices)", () => {
  const question = { body: {} } as never;
  it("maps mcq selections through choiceOrder", () => {
    const served = { questionId: "q", order: 0, choiceOrder: [2, 0, 1] };
    const answer = unmapAnswer(question, served, { kind: "choice", selected: [0, 2] });
    expect(answer).toEqual({ kind: "choice", selected: [2, 1] });
  });
  it("maps ordering arrangements", () => {
    const served = { questionId: "q", order: 0, choiceOrder: [1, 0, 2] };
    const answer = unmapAnswer(question, served, { kind: "ordering", order: [1, 0, 2] });
    expect(answer).toEqual({ kind: "ordering", order: [0, 1, 2] });
  });
});

describe("TOTP (spec FR-1.4 admin MFA)", () => {
  it("round-trips a generated secret", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, totpCode(secret))).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });
});
