import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Tile } from "../components/tile";
import { CoverUrlField } from "../components/cover-url-field";

const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");

describe("qualification fixes", () => {
  it("lets size utilities on a CourseCover win over its base rule", () => {
    // An unlayered `.course-cover { width: 100% }` beats Tailwind's layered `w-16`, blowing list thumbnails up to full width.
    expect(css).toMatch(/@layer components\s*\{\s*\.course-cover\s*\{[^}]*width:\s*100%/);
    expect(css).not.toMatch(/^\.course-cover\s*\{/m);
  });

  it("keeps a due-soon figure quieter than an overdue one", () => {
    const warning = renderToStaticMarkup(createElement(Tile, { label: "Due soon", value: 1, tone: "warning" }));
    const destructive = renderToStaticMarkup(createElement(Tile, { label: "Overdue", value: 1, tone: "destructive" }));
    expect(warning).not.toContain("bg-warning-tint");
    expect(warning).toContain("bg-warning");
    expect(warning).toContain("bg-surface");
    expect(destructive).toContain("bg-surface");
  });

  it("shows the whole illustration in the small cover preview", () => {
    const html = renderToStaticMarkup(createElement(CoverUrlField, { defaultValue: "", title: "Customer service", tags: [] }));
    expect(html).toMatch(/class="course-cover[^"]*course-cover-compact/);
  });
});
