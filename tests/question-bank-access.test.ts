import { describe, expect, it } from "vitest";
import { hasPermission } from "../lib/auth/permissions";
import { ADMIN_NAV, DEPARTMENT_NAV, HR_NAV, questionBankPath, workspaceNavigation } from "../lib/navigation";

describe("question bank access", () => {
  it("grants question.author only to authors", () => {
    for (const role of ["ADMIN", "HR_HEAD", "INSTRUCTOR"] as const) expect(hasPermission(role, "question.author")).toBe(true);
    for (const role of ["DEPARTMENT_HEAD", "LEARNER"] as const) expect(hasPermission(role, "question.author")).toBe(false);
  });
  it("nav shows Question bank to authors", () => {
    expect(workspaceNavigation("INSTRUCTOR")).toContainEqual({ href: "/instructor/questions", label: "Question bank", icon: "note" });
    expect(HR_NAV.map(i => i.href)).toContain("/hr/questions");
    expect(ADMIN_NAV.find(i => i.href === "/admin/questions")).toMatchObject({ label: "Question bank", icon: "note", group: "Learning" });
    expect(DEPARTMENT_NAV.some(i => i.href.includes("/questions"))).toBe(false);
  });
  it("questionBankPath maps roles", () => {
    expect(questionBankPath("ADMIN")).toBe("/admin/questions");
    expect(questionBankPath("HR_HEAD")).toBe("/hr/questions");
    expect(questionBankPath("INSTRUCTOR")).toBe("/instructor/questions");
    expect(() => questionBankPath("DEPARTMENT_HEAD")).toThrow();
    expect(() => questionBankPath("LEARNER")).toThrow();
  });
});
