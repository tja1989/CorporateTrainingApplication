import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceReports } from "../components/workspace-reports";

const rows = (n: number) => Array.from({ length: n }, (_, i) => [`Person ${i}`, "ON_TRACK"]);
const render = (n: number, page?: string) => renderToStaticMarkup(createElement(WorkspaceReports, {
  base: "/team/reports", report: "compliance", params: page ? { page } : {}, result: { title: "Compliance matrix", columns: ["Employee", "Status"], rows: rows(n) },
})).replace(/<!-- -->/g, "");

describe("report summary", () => {
  it("states the result count once", () => {
    const html = render(18);
    expect(html).toContain("18 results");
    expect(html).not.toContain("CSV uses these same filters");
    expect(html).not.toContain("Showing");
  });
  it("keeps the CSV note visible", () => expect(render(3)).toContain("CSV includes all filtered results"));
  it("keeps Apply filters secondary, leaving Ask Reports the page's one primary", () => {
    const button = render(3).match(/<button[^>]*type="submit"[^>]*>Apply filters<\/button>/)?.[0] ?? "";
    expect(button).toContain("bg-surface");
    expect(button).not.toContain("bg-primary");
  });
  it("words a single result", () => expect(render(1)).toContain("1 result<"));
  it("shows pagination only when there is more than one page", () => {
    expect(render(18)).not.toContain("Page 1 of 1");
    expect(render(60)).toContain("Page 1 of 2");
  });
  it("renders statuses as words", () => {
    const html = render(2);
    expect(html).toContain(">On track<");
    expect(html).not.toContain(">ON_TRACK<");
    expect(html).not.toContain(">on track<"); // filter option labels too
  });
});
