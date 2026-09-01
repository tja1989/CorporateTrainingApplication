import { describe, expect, it } from "vitest";
import { rrfMerge } from "@/lib/retrieval";

describe("reciprocal rank fusion (spec §9.2)", () => {
  it("item ranked well in both lists wins", () => {
    const merged = rrfMerge([
      ["a", "b", "c"],
      ["b", "a", "d"],
    ]);
    expect(merged[0].id).toBe("a"); // 1/61 + 1/62 vs b: 1/62 + 1/61 — tie; order by score then insertion
    const scores = Object.fromEntries(merged.map((m) => [m.id, m.score]));
    expect(scores.a).toBeCloseTo(scores.b);
    expect(scores.a).toBeGreaterThan(scores.c);
    expect(scores.a).toBeGreaterThan(scores.d);
  });
  it("k=60 dampens rank-1 dominance", () => {
    const merged = rrfMerge([["x"], ["y"]]);
    expect(merged[0].score).toBeCloseTo(1 / 61);
  });
  it("duplicate ranking doubles its weight (offline FTS boost)", () => {
    const merged = rrfMerge([["a"], ["b"], ["b"]]);
    expect(merged[0].id).toBe("b");
  });
});
