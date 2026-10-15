import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseFeedbackForm } from "../components/course-feedback-form";

const saveButton = (html: string, kind: string) => html.match(new RegExp(`<button[^>]*type="submit"[^>]*>Save ${kind} feedback</button>`))?.[0] ?? "";

describe("feedback form emphasis", () => {
  it("keeps Save quiet until the person changes the response, so two forms never compete", () => {
    for (const kind of ["course", "instructor"] as const) {
      const html = renderToStaticMarkup(createElement(CourseFeedbackForm, { kind, initial: null, requestId: "r1", action: async () => ({ ok: true }) as never }));
      expect(saveButton(html, kind)).toContain("bg-surface");
      expect(saveButton(html, kind)).not.toContain("bg-primary");
    }
  });
});
