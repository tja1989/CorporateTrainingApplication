import { expect, it } from "vitest";
import {
  evaluateCoursePlanningAccess,
  type PlanningCourse,
} from "../lib/lms/planning-access";

const course: PlanningCourse = {
  id: "target",
  title: "Target",
  status: "PUBLISHED",
  approvalState: "APPROVED",
  approvedRevision: 2,
  contentRevision: 2,
  startsAt: null,
};
const now = new Date("2026-10-20T00:00:00Z");
it("denies unavailable or stale-approval courses before considering completed prerequisites", () => {
  expect(evaluateCoursePlanningAccess(null, [], new Set(), now)).toMatchObject({
    blocked: true,
    reason: "unavailable",
  });
  expect(
    evaluateCoursePlanningAccess(
      { ...course, approvedRevision: 1 },
      [],
      new Set(),
      now,
    ),
  ).toMatchObject({ blocked: true, reason: "unavailable" });
  expect(
    evaluateCoursePlanningAccess(
      { ...course, status: "DRAFT" },
      [],
      new Set(),
      now,
    ),
  ).toMatchObject({ blocked: true, reason: "unavailable" });
});
it("opens at the exact server instant without using a completion-target closing gate", () => {
  const scheduled = { ...course, startsAt: new Date("2026-10-20T00:00Z") };
  expect(
    evaluateCoursePlanningAccess(
      scheduled,
      [],
      new Set(),
      new Date("2026-10-19T23:59:59.999Z"),
    ),
  ).toMatchObject({ blocked: true, reason: "scheduled" });
  expect(evaluateCoursePlanningAccess(scheduled, [], new Set(), now)).toEqual({
    blocked: false,
  });
  expect(
    evaluateCoursePlanningAccess(
      scheduled,
      [],
      new Set(),
      new Date("2035-01-01Z"),
    ),
  ).toEqual({ blocked: false });
});
it("requires every immutable prerequisite completion, not any one or a progress percentage", () => {
  const required = [
    { id: "a", title: "A", available: true },
    { id: "b", title: "B", available: true },
  ];
  expect(
    evaluateCoursePlanningAccess(course, required, new Set(["a"]), now),
  ).toMatchObject({
    blocked: true,
    reason: "prerequisite",
    requiredCourses: [{ id: "b" }],
  });
  expect(
    evaluateCoursePlanningAccess(course, required, new Set(["a", "b"]), now),
  ).toEqual({ blocked: false });
});
it("honors historical completion of a now archived prerequisite", () => {
  const required = [{ id: "a", title: "A", available: false }];
  expect(
    evaluateCoursePlanningAccess(course, required, new Set(["a"]), now),
  ).toEqual({ blocked: false });
  expect(
    evaluateCoursePlanningAccess(course, required, new Set(), now),
  ).toMatchObject({
    blocked: true,
    requiredCourses: [{ id: "a", available: false }],
  });
});
it("leaves undated legacy publications open", () => {
  expect(
    evaluateCoursePlanningAccess(
      { ...course, approvalState: "LEGACY_PUBLISHED", approvedRevision: null },
      [],
      new Set(),
      now,
    ),
  ).toEqual({ blocked: false });
});
