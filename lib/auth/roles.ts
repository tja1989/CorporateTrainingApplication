export const ROLES = ["ADMIN", "DEPARTMENT_HEAD", "HR_HEAD", "INSTRUCTOR", "LEARNER"] as const;
export type Role = typeof ROLES[number];
export type StoredRole = Role | "MANAGER";
export type Workspace = "admin" | "department" | "hr" | "instructor" | "learner";
export type Actor = { id: string; role: Role; departmentId: string | null };
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Super Admin / IT Admin", DEPARTMENT_HEAD: "Department Head", HR_HEAD: "HR Head / L&T Head",
  INSTRUCTOR: "Instructor / Trainer", LEARNER: "Employee",
};
export function canonicalRole(raw: string): Role | null {
  if (raw === "MANAGER") return "DEPARTMENT_HEAD";
  return (ROLES as readonly string[]).includes(raw) ? raw as Role : null;
}
export function needsMfa(role: Role): boolean { return role === "ADMIN" || role === "HR_HEAD"; }
export function defaultWorkspace(role: Role): Workspace {
  return ({ADMIN:"admin",DEPARTMENT_HEAD:"department",HR_HEAD:"hr",INSTRUCTOR:"instructor",LEARNER:"learner"} as const)[role];
}
export function workspaceHome(workspace: Workspace | "manager"): string {
  return ({admin:"/admin",department:"/department",hr:"/hr",instructor:"/instructor",learner:"/home",manager:"/department"} as const)[workspace];
}
export function allowedWorkspaces(role: Role): Workspace[] {
  return role === "LEARNER" ? ["learner"] : [defaultWorkspace(role), "learner"];
}
export function effectiveWorkspace(role: Role, workspace: string): Workspace {
  const requested = workspace === "manager" ? "department" : workspace;
  return allowedWorkspaces(role).includes(requested as Workspace) ? requested as Workspace : defaultWorkspace(role);
}
export function policyAudience(role: Role): "all" | "managers" {
  return ["ADMIN", "DEPARTMENT_HEAD", "HR_HEAD"].includes(role) ? "managers" : "all";
}
export function canResetPerson(actor: Actor, target: Actor): boolean {
  if (actor.role === "ADMIN") return true;
  if (target.role !== "LEARNER") return false;
  if (actor.role === "HR_HEAD") return true;
  return actor.role === "DEPARTMENT_HEAD" && !!actor.departmentId && actor.departmentId === target.departmentId;
}
