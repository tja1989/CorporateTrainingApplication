import { expect, it, vi } from "vitest";
vi.mock("@/lib/db/client", async () => ({
  t: await import("../lib/db/schema"),
  db: {
    transaction: async (run: any) =>
      run({
        execute: async () => {},
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: "employee",
                  role: "LEARNER",
                  passwordState: "ACTIVE",
                  erasedAt: null,
                },
              ],
            }),
          }),
        }),
      }),
  },
}));
import { validateFeedback } from "../lib/feedback/validation";
it("requires a whole-number rating from 1 to 5", () => {
  for (const rating of [0, 6, 1.5, NaN, "garbage", null])
    expect(validateFeedback(rating, "Useful")).toEqual({
      ok: false,
      error: "Choose a whole-number rating from 1 to 5.",
    });
  for (const rating of [1, 5])
    expect(validateFeedback(rating, "Useful")).toEqual({
      ok: true,
      rating,
      comment: "Useful",
    });
});
it("supports multiline Unicode and checks the comment boundary without silently truncating it", () => {
  const comment = "Helpful\nمفيد\nहिन्दी";
  expect(validateFeedback(4, comment)).toEqual({
    ok: true,
    rating: 4,
    comment,
  });
  expect(validateFeedback(4, "x".repeat(2000)).ok).toBe(true);
  expect(validateFeedback(4, "x".repeat(2001))).toEqual({
    ok: false,
    error: "Keep comments within 2,000 characters.",
  });
});
