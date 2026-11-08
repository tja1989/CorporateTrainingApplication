import type { Role } from "./roles";
export type Permission =
  | "identity.manage"
  | "course.author"
  | "question.author"
  | "course.approve"
  | "course.publish"
  | "course.override"
  | "course.rollout"
  | "reports.read"
  | "hr.manage"
  | "assessment.review"
  | "feedback.read"
  | "feedback.moderate";
const GRANTS: Record<Role, readonly Permission[]> = {
  ADMIN: [
    "identity.manage",
    "course.author",
    "question.author",
    "course.approve",
    "course.publish",
    "course.override",
    "course.rollout",
    "reports.read",
    "hr.manage",
    "assessment.review",
    "feedback.read",
    "feedback.moderate",
  ],
  HR_HEAD: [
    "course.author",
    "question.author",
    "course.publish",
    "course.rollout",
    "reports.read",
    "hr.manage",
    "assessment.review",
    "feedback.read",
    "feedback.moderate",
  ],
  DEPARTMENT_HEAD: [
    "course.approve",
    "course.rollout",
    "reports.read",
    "feedback.read",
  ],
  INSTRUCTOR: ["course.author", "question.author", "reports.read", "feedback.read"],
  LEARNER: [],
};
export function hasPermission(role: Role, permission: Permission): boolean {
  return GRANTS[role]?.includes(permission) ?? false;
}
