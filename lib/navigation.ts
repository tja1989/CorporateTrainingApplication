import type { IconName } from "@/components/icons";
import { canonicalRole } from "@/lib/auth/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  group?: string;
};
export const LEARNER_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/learn", label: "My Learning", icon: "book" },
  { href: "/drill", label: "Practice", icon: "target" },
  { href: "/ask-hr", label: "HR Help", icon: "question" },
  { href: "/profile", label: "Profile", icon: "user" },
];
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "grid" },
  { href: "/admin/courses", label: "Courses", icon: "book", group: "Learning" },
  {
    href: "/admin/rollout",
    label: "Training rollout",
    icon: "arrow-right",
    group: "Learning",
  },
  {
    href: "/admin/people",
    label: "People",
    icon: "users",
    group: "People",
  },
  {
    href: "/admin/corpus",
    label: "Policy library",
    icon: "file-text",
    group: "HR",
  },
  { href: "/admin/tickets", label: "HR tickets", icon: "mail", group: "HR" },
  {
    href: "/admin/reviews",
    label: "Assessment reviews",
    icon: "check-square",
    group: "Oversight",
  },
  {
    href: "/admin/reports",
    label: "Reports",
    icon: "chart",
    group: "Oversight",
  },
  { href: "/feedback", label: "Feedback reports", icon: "star", group: "Oversight" },
  {
    href: "/admin/integrity",
    label: "Assessment integrity",
    icon: "shield",
    group: "Oversight",
  },
];
export const MANAGER_NAV: NavItem[] = [
  { href: "/team", label: "My team", icon: "users" },
  { href: "/team/reports", label: "Team reports", icon: "chart" },
];
export const HR_NAV: NavItem[] = [
  { href: "/hr", label: "Overview", icon: "grid" },
  { href: "/hr/courses", label: "Courses", icon: "book" },
  { href: "/hr/rollout", label: "Training rollout", icon: "arrow-right" },
  { href: "/hr/people", label: "Employees", icon: "users" },
  { href: "/hr/reports", label: "Reports", icon: "chart" },
  { href: "/feedback", label: "Feedback reports", icon: "star" },
  {
    href: "/admin/corpus",
    label: "Policy library",
    icon: "file-text",
    group: "HR",
  },
  { href: "/admin/tickets", label: "HR tickets", icon: "mail", group: "HR" },
  {
    href: "/admin/reviews",
    label: "Assessment reviews",
    icon: "check-square",
    group: "Oversight",
  },
];
export const DEPARTMENT_NAV: NavItem[] = [
  { href: "/department", label: "Overview", icon: "grid" },
  {
    href: "/department/approvals",
    label: "Course approvals",
    icon: "check-square",
  },
  { href: "/department/courses", label: "Department courses", icon: "book" },
  { href: "/team", label: "My team", icon: "users" },
  { href: "/department/rollout", label: "Training rollout", icon: "arrow-right" },
  { href: "/department/reports", label: "Reports", icon: "chart" },
  { href: "/feedback", label: "Feedback reports", icon: "star" },
];
export const INSTRUCTOR_NAV: NavItem[] = [
  { href: "/instructor", label: "Overview", icon: "grid" },
  { href: "/instructor/courses", label: "My courses", icon: "book" },
  { href: "/instructor/reports", label: "Training reports", icon: "chart" },
  { href: "/feedback", label: "Feedback reports", icon: "star" },
];
export function workspaceNavigation(role: string): NavItem[] {
  switch (canonicalRole(role)) {
    case "ADMIN":
      return ADMIN_NAV;
    case "HR_HEAD":
      return HR_NAV;
    case "DEPARTMENT_HEAD":
      return DEPARTMENT_NAV;
    case "INSTRUCTOR":
      return INSTRUCTOR_NAV;
    default:
      return LEARNER_NAV;
  }
}

/** One current destination, including deeper routes. Segment matching avoids prefix collisions. */
export function activeNavHref(
  pathname: string,
  items: NavItem[],
): string | undefined {
  const path =
    items.some((item) => item.href === "/learn") &&
    /^\/(course|path|lesson|quiz)\//.test(pathname)
      ? "/learn"
      : // HR reaches employee records through the shared /team/[id] page.
        items.some((item) => item.href === "/hr/people") && /^\/team\/[^/]+/.test(pathname)
        ? "/hr/people"
        : pathname;
  return items
    .filter((item) => path === item.href || path.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
export function isLessonWorkspace(pathname: string): boolean {
  return pathname.startsWith("/lesson/");
}

/** Arrow keys follow visual direction; Home/End remain logical first/last. */
export function nextTabIndex(
  key: string,
  index: number,
  count: number,
  rtl = false,
): number | null {
  if (count < 1) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key !== "ArrowRight" && key !== "ArrowLeft") return null;
  const delta = (key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
  return (index + delta + count) % count;
}
