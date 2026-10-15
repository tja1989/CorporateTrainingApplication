import { describe, expect, it } from "vitest";
import { ADMIN_NAV, DEPARTMENT_NAV, HR_NAV, INSTRUCTOR_NAV, LEARNER_NAV, MANAGER_NAV, activeNavHref, isLessonWorkspace } from "../lib/navigation";

describe("workspace navigation", () => {
  it("offers the five learner destinations in the mobile order", () => {
    expect(LEARNER_NAV.map(({ href, label }) => [href, label])).toEqual([
      ["/home", "Home"], ["/learn", "My Learning"], ["/drill", "Practice"], ["/ask-hr", "HR Help"], ["/profile", "Profile"],
    ]);
  });
  it("keeps course, path, quiz and lesson journeys under My Learning", () => {
    for (const path of ["/course/c1", "/path/p1", "/quiz/q1", "/lesson/l1", "/lesson/l1/interview"]) {
      expect(activeNavHref(path, LEARNER_NAV)).toBe("/learn");
    }
  });
  it("selects the most specific workspace destination without prefix collisions", () => {
    expect(activeNavHref("/team/reports", MANAGER_NAV)).toBe("/team/reports");
    expect(activeNavHref("/team/employee-1", MANAGER_NAV)).toBe("/team");
    expect(activeNavHref("/admin/courses/c1", ADMIN_NAV)).toBe("/admin/courses");
    expect(activeNavHref("/admin", ADMIN_NAV)).toBe("/admin");
    expect(activeNavHref("/administrator", ADMIN_NAV)).toBeUndefined();
  });
  it("keeps administrator workflows findable in named groups", () => {
    expect([...new Set(ADMIN_NAV.map(item => item.group).filter(Boolean))]).toEqual(["Learning", "People", "HR", "Oversight"]);
    expect(ADMIN_NAV.map(item => item.href)).toEqual(expect.arrayContaining(["/admin/courses", "/admin/people", "/admin/corpus", "/admin/tickets", "/admin/reviews", "/admin/reports", "/admin/integrity"]));
  });
  it("uses the compact workspace only for lesson routes", () => {
    expect(isLessonWorkspace("/lesson/l1")).toBe(true);
    expect(isLessonWorkspace("/lesson/l1/interview")).toBe(true);
    expect(isLessonWorkspace("/learn")).toBe(false);
    expect(isLessonWorkspace("/lessons")).toBe(false);
  });
});

import { nextTabIndex } from "../lib/navigation";
describe("keyboard tabs", () => {
  it("wraps through tabs and supports Home and End", () => {
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("Enter", 1, 3)).toBeNull();
  });
  it("follows the visible direction in RTL", () => {
    expect(nextTabIndex("ArrowRight", 1, 3, true)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 1, 3, true)).toBe(2);
  });
});

describe("sidebar consistency", () => {
  it("keeps each sidebar group contiguous", () => {
    for (const nav of [ADMIN_NAV, HR_NAV]) {
      const groups = nav.map(i => i.group ?? "").filter((g, i, a) => g && g !== a[i - 1]);
      expect(new Set(groups).size).toBe(groups.length);
      const lastUngrouped = nav.map(i => i.group).lastIndexOf(undefined);
      expect(nav.slice(0, lastUngrouped + 1).every(i => !i.group)).toBe(true);
    }
  });
  it("gives every item in a role's sidebar its own icon", () => {
    for (const nav of [ADMIN_NAV, HR_NAV, DEPARTMENT_NAV, INSTRUCTOR_NAV]) expect(new Set(nav.map(i => i.icon)).size).toBe(nav.length);
  });
  it("keeps HR's Employees item active on an employee's record", () => {
    expect(activeNavHref("/team/user-1", HR_NAV)).toBe("/hr/people");
    expect(activeNavHref("/team/user-1", DEPARTMENT_NAV)).toBe("/team");
  });
  it("labels sidebar items with their page titles", () => {
    expect(DEPARTMENT_NAV.find(i => i.href === "/team")?.label).toBe("My team");
    expect(ADMIN_NAV.find(i => i.href === "/admin/people")?.label).toBe("People");
  });
});
