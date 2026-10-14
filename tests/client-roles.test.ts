import { describe, expect, it } from "vitest";
import { canonicalRole, needsMfa, defaultWorkspace, allowedWorkspaces, workspaceHome, policyAudience, canResetPerson } from "../lib/auth/roles";
import { hasPermission } from "../lib/auth/permissions";

describe("client permission roles", () => {
  it("maps legacy managers without granting HR or administrator rights", () => {
    expect(canonicalRole("MANAGER")).toBe("DEPARTMENT_HEAD");
    expect(canonicalRole("UNKNOWN")).toBeNull();
    expect(hasPermission("DEPARTMENT_HEAD", "identity.manage")).toBe(false);
    expect(hasPermission("DEPARTMENT_HEAD", "course.publish")).toBe(false);
  });
  it("separates instructor authoring from approval and publication", () => {
    expect(hasPermission("INSTRUCTOR", "course.author")).toBe(true);
    expect(hasPermission("INSTRUCTOR", "course.approve")).toBe(false);
    expect(hasPermission("INSTRUCTOR", "course.publish")).toBe(false);
    expect(hasPermission("INSTRUCTOR", "hr.manage")).toBe(false);
    expect(policyAudience("INSTRUCTOR")).toBe("all");
  });
  it("requires MFA for HR and Super Admin without imposing it on employees", () => {
    expect(needsMfa("HR_HEAD")).toBe(true);
    expect(needsMfa("ADMIN")).toBe(true);
    expect(needsMfa("LEARNER")).toBe(false);
    expect(needsMfa("INSTRUCTOR")).toBe(false);
  });
  it.each([
    ["ADMIN", "admin", "/admin"], ["HR_HEAD", "hr", "/hr"],
    ["DEPARTMENT_HEAD", "department", "/department"], ["INSTRUCTOR", "instructor", "/instructor"],
    ["LEARNER", "learner", "/home"],
  ] as const)("routes %s to its own workspace", (role, workspace, home) => {
    expect(defaultWorkspace(role)).toBe(workspace);
    expect(workspaceHome(workspace)).toBe(home);
    expect(allowedWorkspaces(role)).toEqual(role === "LEARNER" ? ["learner"] : [workspace, "learner"]);
  });
  it("does not turn HR into an identity administrator", () => {
    expect(hasPermission("HR_HEAD", "course.publish")).toBe(true);
    expect(hasPermission("HR_HEAD", "identity.manage")).toBe(false);
    expect(hasPermission("HR_HEAD", "course.override")).toBe(false);
  });
  it("restricts password resets to authorized employee accounts", () => {
    const head = {id:"head", role:"DEPARTMENT_HEAD" as const, departmentId:"a"};
    const employee = {id:"employee",role:"LEARNER" as const,departmentId:"a"};
    expect(canResetPerson(head, employee)).toBe(true);
    expect(canResetPerson(head, {...employee,departmentId:"b"})).toBe(false);
    expect(canResetPerson({...head,departmentId:null}, {...employee,departmentId:null})).toBe(false);
    expect(canResetPerson({id:"hr",role:"HR_HEAD",departmentId:null}, {...employee,role:"ADMIN"})).toBe(false);
    expect(canResetPerson({id:"trainer",role:"INSTRUCTOR",departmentId:"a"}, employee)).toBe(false);
  });
});
