import { hasPermission } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/roles";
export type CourseOwnership = {
  instructorId: string | null;
  departmentId: string | null;
};
export function canAuthorCourse(
  actor: Actor,
  course: CourseOwnership,
): boolean {
  return (
    hasPermission(actor.role, "course.author") &&
    (actor.role !== "INSTRUCTOR" || course.instructorId === actor.id)
  );
}
export function canReadCourse(actor: Actor, course: CourseOwnership): boolean {
  return (
    actor.role === "ADMIN" ||
    actor.role === "HR_HEAD" ||
    (actor.role === "INSTRUCTOR" && course.instructorId === actor.id) ||
    (actor.role === "DEPARTMENT_HEAD" &&
      !!actor.departmentId &&
      actor.departmentId === course.departmentId)
  );
}
export function courseWorkspacePath(actor: Actor, courseId: string): string {
  const root =
    actor.role === "ADMIN"
      ? "admin"
      : actor.role === "HR_HEAD"
        ? "hr"
        : actor.role === "DEPARTMENT_HEAD"
          ? "department"
          : "instructor";
  return `/${root}/courses/${encodeURIComponent(courseId)}`;
}
