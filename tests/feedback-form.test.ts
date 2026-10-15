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

describe("star rating", () => {
  it("draws five stars over native radios that keep their names", () => {
    const html = renderToStaticMarkup(createElement(CourseFeedbackForm, { kind: "course", initial: null, requestId: "r1", action: async () => ({ ok: true }) as never }));
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    for (const name of ["1 — Poor", "2 — Fair", "3 — Good", "4 — Very good", "5 — Excellent"]) expect(html).toContain(`<span class="sr-only">${name}</span>`);
    expect(html.match(/data-star="/g)).toHaveLength(5);
  });
  it("fills the stars up to the saved rating", () => {
    const html = renderToStaticMarkup(createElement(CourseFeedbackForm, { kind: "course", initial: { rating: 4, comment: "", revision: 1, updatedAt: new Date().toISOString() } as never, requestId: "r1", action: async () => ({ ok: true }) as never }));
    expect(html.match(/data-star="filled"/g)).toHaveLength(4);
  });
});
