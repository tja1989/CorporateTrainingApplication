import { describe, expect, it } from "vitest";
import { validateCitations } from "@/lib/ai/tutor";

const chunks = [
  { startSec: 30, endSec: 48 },
  { startSec: 100, endSec: 140 },
];

describe("tutor citation validation (spec FR-5.11)", () => {
  it("keeps citations inside a retrieved chunk", () => {
    expect(validateCitations([{ startSec: 35, endSec: 40, quote: "" }], chunks)).toHaveLength(1);
  });
  it("allows ±10s tolerance", () => {
    expect(validateCitations([{ startSec: 22, endSec: 30, quote: "" }], chunks)).toHaveLength(1);
    expect(validateCitations([{ startSec: 55, endSec: 60, quote: "" }], chunks)).toHaveLength(1);
  });
  it("drops hallucinated timestamps", () => {
    expect(validateCitations([{ startSec: 500, endSec: 520, quote: "" }], chunks)).toHaveLength(0);
  });
});
