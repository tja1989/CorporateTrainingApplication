import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

// Browser tests must assert the wording people now see, not copy this phase removed.
const E2E = resolve(__dirname, "../e2e");
const REMOVED = ["Super Admin intervention", "Apply recorded intervention", "Retry video ingestion", "Retry ingestion", "View interpreted report", "Training completed", "attempt(s)", "question(s)", "CSV uses these same filters", "Offline demo mode"];

describe("e2e copy", () => {
  it("asserts no removed wording", () => {
    const hits = readdirSync(E2E).filter(f => f.endsWith(".ts")).flatMap(f => {
      const text = readFileSync(join(E2E, f), "utf8");
      // Only selectors and assertions matter; test titles and typed reasons may say anything.
      const calls = [...text.matchAll(/(?:getByText|getByRole|getByLabel|toContainText|toHaveText)\([^)]*\)/g)].map(m => m[0]).join("\n");
      return REMOVED.filter(s => calls.includes(s)).map(s => `${f}: ${s}`);
    });
    expect(hits).toEqual([]);
  });
  it("compares CSV codes with on-screen words through the shared vocabulary", () => {
    for (const f of ["reports-qualification.e2e.ts", "report-readability.e2e.ts"]) expect(readFileSync(join(E2E, f), "utf8")).toContain("statusLabel");
  });
});
