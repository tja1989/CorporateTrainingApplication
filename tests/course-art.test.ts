import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { courseArt } from "../lib/course-art";
import { CourseCover } from "../components/course-cover";

describe("course art", () => {
  it.each([
    ["Food Safety Essentials", ["compliance", "fresh-food"], "food"],
    ["Fire & Emergency", [], "fire"],
    ["Customer Service Basics", ["service"], "service"],
    ["POS & Cash Handling", [], "cash"],
    ["Workplace Security", [], "safety"],
    ["Merchandising 101", [], "learning"],
  ])("%s draws the %s illustration", (title, tags, subject) => expect(courseArt(title, tags as string[]).subject).toBe(subject));
  it.each([
    ["Data Protection Refresher", "learning"],
    ["Steam Oven Basics", "learning"],
    ["Tilling the Garden", "learning"],
    ["Fresh Produce Handling", "food"],
    ["Store Teams in Action", "service"],
  ])("matches whole words only: %s draws the %s illustration", (title, subject) => expect(courseArt(title).subject).toBe(subject));
  it("gives courses on the same subject different background patterns", () => {
    const titles = ["Food Safety Essentials", "Kitchen Hygiene", "Allergen Awareness", "Cold Chain Basics", "Fresh Food Handling", "Food Labelling"];
    const art = titles.map((title) => courseArt(title));
    expect(new Set(art.map((a) => a.field))).toEqual(new Set([1]));
    expect(new Set(art.map((a) => a.pattern)).size).toBeGreaterThan(1);
  });
  it("is stable for the same course and always picks a valid field", () => {
    expect(courseArt("Merchandising 101")).toEqual(courseArt("Merchandising 101"));
    for (const title of ["", "x".repeat(300), "مقدمة في خدمة العملاء", "Merchandising 101"]) expect([1, 2, 3, 4, 5, 6]).toContain(courseArt(title).field);
  });
  it("renders a coloured field and an illustration instead of placeholder lines", () => {
    const html = renderToStaticMarkup(createElement(CourseCover, { title: "Fire & Emergency", tags: [] }));
    expect(html).toMatch(/cover-field-[1-6]/);
    expect(html).toContain("<svg");
    expect(html).not.toContain("course-cover-line");
  });
  it("keeps white illustrations readable on every field in both themes", () => {
    const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
    const lum = (hex: string) => hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((acc, v, i) => acc + v * [.2126, .7152, .0722][i], 0);
    for (const block of [css.slice(css.indexOf(":root {")).split("}")[0], css.slice(css.indexOf(".dark {")).split("}")[0]]) {
      const fields = [...block.matchAll(/--cover-([1-6]):\s*(#[\da-f]{6})/gi)];
      expect(fields).toHaveLength(6);
      for (const [, , hex] of fields) expect(1.05 / (lum(hex) + .05)).toBeGreaterThanOrEqual(3);
    }
  });
});
