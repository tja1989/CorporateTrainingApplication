import { describe, expect, it } from "vitest";
import { markdownBlocks } from "@/lib/markdown";

describe("policy and lesson Markdown", () => {
  it("recognizes headings next to body copy without requiring blank lines", () => {
    expect(markdownBlocks("# Leave & Time Off\n\n## Annual leave\nAsk your manager.\n## Sick leave\nNotify your manager."))
      .toEqual(["# Leave & Time Off", "## Annual leave", "Ask your manager.", "## Sick leave", "Notify your manager."]);
  });
  it("preserves inline content and multiline list blocks", () => {
    expect(markdownBlocks("## Checklist\r\n- **First** step\r\n- Second step\r\n\r\nKeep # inside a sentence."))
      .toEqual(["## Checklist", "- **First** step\n- Second step", "Keep # inside a sentence."]);
  });
});
