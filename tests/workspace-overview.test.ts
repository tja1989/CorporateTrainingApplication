import { describe, expect, it } from "vitest";
import { overviewFigures } from "../lib/overview";

const c = (status: string, approvalState: string) => ({ status, approvalState });
const courses = [c("DRAFT", "DRAFT"), c("DRAFT", "SUBMITTED"), c("DRAFT", "REJECTED"), c("DRAFT", "APPROVED"), c("PUBLISHED", "LEGACY_PUBLISHED"), c("PUBLISHED", "APPROVED")];
const values = (f: ReturnType<typeof overviewFigures>) => Object.fromEntries(f.map(x => [x.label, x.value]));

describe("role overview figures", () => {
  it("counts an instructor's work by state and flags requested changes", () => {
    const f = overviewFigures("INSTRUCTOR", "/instructor", courses);
    expect(values(f)).toEqual({ Drafts: 1, "Awaiting approval": 1, "Changes requested": 1, Published: 2 });
    expect(f.find(x => x.label === "Changes requested")?.tone).toBe("warning");
  });
  it("puts a Department Head's review queue next to team deadlines", () => {
    const f = overviewFigures("DEPARTMENT_HEAD", "/department", courses, { overdue: 3, dueSoon: 2 });
    expect(values(f)).toEqual({ "Awaiting your review": 1, "Published courses": 2, "Overdue training": 3, "Due soon": 2 });
    expect(f.find(x => x.label === "Overdue training")).toMatchObject({ tone: "destructive", href: "/team?filter=OVERDUE" });
    expect(f[0].href).toBe("/department/approvals");
  });
  it("shows HR what is ready to publish", () => {
    expect(values(overviewFigures("HR_HEAD", "/hr", courses))).toEqual({ "Ready to publish": 1, "Awaiting department review": 1, Published: 2, Drafts: 1 });
  });
  it("renders calm zeros for empty workspaces", () => {
    for (const role of ["INSTRUCTOR", "DEPARTMENT_HEAD", "HR_HEAD"] as const) {
      const f = overviewFigures(role, "/x", [], { overdue: 0, dueSoon: 0 });
      expect(f.every(x => x.value === 0 && x.tone === "default")).toBe(true);
    }
  });
});
