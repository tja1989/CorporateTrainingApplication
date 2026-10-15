import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { VoiceConsent } from "../components/voice-consent";
import { DataTable } from "../components/workspace-ui";
import { renderNotification } from "../lib/notify";

const noop = () => {};
const consent = (kind: "hr" | "interview") => renderToStaticMarkup(createElement(VoiceConsent, { kind, configured: false, starting: false, onStart: noop, onStartTyped: noop, onTestSpeaker: noop }));

describe("review minors", () => {
  it("does not mention grading on the HR assistant's demo line", () => {
    expect(consent("hr")).not.toContain("Grading");
    expect(consent("hr")).toContain("Demo mode:");
    expect(consent("interview")).toContain("Demo mode: type your answers. Grading works the same way.");
  });
  it.each([
    ["REJECTED", "“Food Safety” needs changes."],
    ["SUBMITTED", "“Food Safety” is waiting for Department Head review."],
    ["APPROVED", "“Food Safety” is approved and ready to publish."],
    ["DRAFT", "“Food Safety” is back in draft."],
  ])("words a %s workflow update naturally", (state, body) => {
    expect(renderNotification("course_workflow_updated", { courseTitle: "Food Safety", state }).body.trim()).toBe(body);
  });
  it("keeps internal terms out of messages people read", () => {
    for (const file of ["lib/feedback/reports.ts", "lib/feedback/service.ts", "app/(workspace)/admin/courses/actions.ts"]) {
      const text = readFileSync(resolve(__dirname, "..", file), "utf8");
      const literals = [...text.matchAll(/"([^"\n]*)"/g)].map(m => m[1]);
      expect(literals.filter(l => /historical instructor|\bingestion\b/i.test(l))).toEqual([]);
    }
  });
  it("draws status chips only in status columns", () => {
    const html = renderToStaticMarkup(createElement(DataTable, { title: "T", columns: ["Name", "Status"], rows: [["READY", "ON_TRACK"]] }));
    expect(html).toContain(">READY<");
    expect(html).toContain(">On track<");
  });
});
