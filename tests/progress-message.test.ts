import { describe, expect, it } from "vitest";
import { progressMessage } from "../lib/lms/progress-message";

describe("course progress status line", () => {
  it("encourages the learner at each stage", () => {
    expect(progressMessage(0, 0)).toBe("Lessons are being prepared.");
    expect(progressMessage(0, 8)).toBe("Start your first lesson to get going.");
    expect(progressMessage(2, 8)).toBe("Good start! Keep going.");
    expect(progressMessage(4, 8)).toBe("You're halfway there! Keep it up!");
    expect(progressMessage(7, 8)).toBe("Almost there. Just a few lessons left.");
    expect(progressMessage(8, 8)).toBe("All lessons complete. Well done!");
  });
});
