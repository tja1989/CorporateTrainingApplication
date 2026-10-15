import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Card, Progress } from "../components/ui";
import { WorkspaceLink } from "../components/workspace-ui";

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const source = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("shared primitives", () => {
  it("draws one progress bar with its value and name", () => {
    const html = render(createElement(Progress, { value: 42, label: "Lesson progress" }));
    expect(html).toMatch(/role="progressbar"[^>]*aria-label="Lesson progress"[^>]*aria-valuenow="42"/);
    expect(html).toContain("rounded-full");
  });
  it("keeps progress within 0–100", () => {
    expect(render(createElement(Progress, { value: 140, label: "x" }))).toContain('aria-valuenow="100"');
    expect(render(createElement(Progress, { value: -5, label: "x" }))).toContain('aria-valuenow="0"');
  });
  it("lifts cards you can open", () => {
    expect(render(createElement(Card, { interactive: true }))).toContain("card-interactive");
    expect(render(createElement(Card, {}))).not.toContain("card-interactive");
  });
  it("renders workspace links as secondary buttons", () => {
    const html = render(createElement(WorkspaceLink, { href: "/x" }, "Go"));
    for (const cls of ["pressable", "border-border", "bg-surface"]) expect(html).toContain(cls);
  });
  it("uses one underline tab style for view switchers", () => {
    expect(source("app/(learner)/learn/page.tsx")).toContain("WorkspaceTabs");
    expect(source("app/(learner)/learn/page.tsx")).not.toMatch(/variant=\{query\.view === view \? "primary"/);
    expect(source("components/feedback-reports.tsx")).not.toContain("PillLink");
  });
});
