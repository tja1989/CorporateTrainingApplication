import { describe, expect, it } from "vitest";
import {
  assertAcyclicPrerequisites,
  courseHasOpened,
  enrollmentDeadline,
  folderChildren,
  normalizeFolderPath,
  parseCoursePlanning,
} from "../lib/courses/planning";

const blank = {
  startDate: "",
  endDate: "",
  folderPath: "",
  prerequisiteIds: [] as string[],
};
describe("Course calendar policy", () => {
  it("opens at Dubai midnight and includes the whole final calendar day", () => {
    expect(
      parseCoursePlanning({
        ...blank,
        startDate: "2026-10-20",
        endDate: "2026-10-21",
      }),
    ).toMatchObject({
      startsAt: new Date("2026-10-19T20:00:00Z"),
      endsAt: new Date("2026-10-21T19:59:59Z"),
    });
  });
  it("leaves legacy dates unset and accepts independently omitted dates", () => {
    expect(parseCoursePlanning(blank)).toMatchObject({
      startsAt: null,
      endsAt: null,
    });
    expect(
      parseCoursePlanning({ ...blank, endDate: "2028-02-29" }).endsAt,
    ).toEqual(new Date("2028-02-29T19:59:59Z"));
    expect(
      parseCoursePlanning({ ...blank, startDate: "2026-12-31" }).startsAt,
    ).toEqual(new Date("2026-12-30T20:00:00Z"));
  });
  it("rejects nonexistent dates rather than rolling into another month", () => {
    for (const value of [
      "2026-02-29",
      "2026-02-30",
      "2026-13-01",
      "2026-04-31",
      "2026-1-02",
      "today",
    ])
      expect(() => parseCoursePlanning({ ...blank, startDate: value })).toThrow(
        /date/i,
      );
  });
  it("rejects a reversed range while accepting a one-day course", () => {
    expect(() =>
      parseCoursePlanning({
        ...blank,
        startDate: "2026-10-22",
        endDate: "2026-10-21",
      }),
    ).toThrow(/end/i);
    expect(
      parseCoursePlanning({
        ...blank,
        startDate: "2026-10-21",
        endDate: "2026-10-21",
      }).endsAt,
    ).toEqual(new Date("2026-10-21T19:59:59Z"));
  });
  it("uses the server instant at the exact opening boundary", () => {
    const opening = new Date("2026-10-19T20:00:00Z");
    expect(courseHasOpened(opening, new Date("2026-10-19T19:59:59.999Z"))).toBe(
      false,
    );
    expect(courseHasOpened(opening, opening)).toBe(true);
    expect(courseHasOpened(null, new Date("2026-10-19T00:00:00Z"))).toBe(true);
    expect(courseHasOpened(opening, new Date("2026-12-01Z"))).toBe(true);
  });
  it("defaults a new deadline to the course target without changing an explicit override", () => {
    const course = {
      startsAt: new Date("2026-10-19T20:00Z"),
      endsAt: new Date("2026-10-21T19:59:59Z"),
    };
    expect(enrollmentDeadline(course, null)).toEqual(
      new Date("2026-10-21T19:59:59Z"),
    );
    expect(enrollmentDeadline(course, new Date("2026-11-01Z"))).toEqual(
      new Date("2026-11-01Z"),
    );
    expect(
      enrollmentDeadline({ startsAt: null, endsAt: null }, null),
    ).toBeNull();
  });
  it("rejects an assignment deadline before opening rather than producing impossible training", () => {
    expect(() =>
      enrollmentDeadline(
        { startsAt: new Date("2026-12-01Z"), endsAt: null },
        new Date("2026-11-30Z"),
      ),
    ).toThrow(/deadline.*open|open.*deadline/i);
  });
});

describe("Course folders", () => {
  it("normalizes Unicode and whitespace without treating names as filesystem paths", () => {
    expect(normalizeFolderPath(" Operations / السلامة / Cafe\u0301 ")).toBe(
      "Operations/السلامة/Café",
    );
    expect(normalizeFolderPath("Health & safety/Yes? #1")).toBe(
      "Health & safety/Yes? #1",
    );
    expect(normalizeFolderPath(" ")).toBe("");
  });
  it("rejects ambiguous, traversal-like and control-character paths", () => {
    for (const value of [
      "/Safety",
      "Safety/",
      "Safety//Food",
      "Safety/../HR",
      "./Safety",
      "Safety\\Food",
      "Safety/\nFood",
      "Safety/\u0000Food",
    ])
      expect(() => normalizeFolderPath(value)).toThrow(/folder/i);
  });
  it("bounds path depth and segment length", () => {
    expect(() => normalizeFolderPath(Array(9).fill("a").join("/"))).toThrow(
      /folder/i,
    );
    expect(() => normalizeFolderPath("x".repeat(81))).toThrow(/folder/i);
    expect(normalizeFolderPath(Array(8).fill("a").join("/"))).toBe(
      "a/a/a/a/a/a/a/a",
    );
  });
  it("lists immediate children and counts courses in descendants only on segment boundaries", () => {
    expect(
      folderChildren(
        [
          { folderPath: "Safety/Food/Cold chain" },
          { folderPath: "Safety/Food" },
          { folderPath: "Safety/Fire" },
          { folderPath: "Safety" },
          { folderPath: "Safetyware/Tools" },
        ],
        "Safety",
      ),
    ).toEqual([
      { name: "Fire", path: "Safety/Fire", count: 1 },
      { name: "Food", path: "Safety/Food", count: 2 },
    ]);
  });
  it("shows nested ancestors at the root without inventing empty folders", () => {
    expect(
      folderChildren(
        [{ folderPath: "Operations/Safety" }, { folderPath: "" }],
        "",
      ),
    ).toEqual([{ name: "Operations", path: "Operations", count: 1 }]);
  });
});

describe("Prerequisite graph", () => {
  it("normalizes duplicates while preserving explicit dependency choices", () => {
    expect(
      parseCoursePlanning({ ...blank, prerequisiteIds: [" a ", "b", "a"] })
        .prerequisiteIds,
    ).toEqual(["a", "b"]);
    expect(() =>
      parseCoursePlanning({ ...blank, prerequisiteIds: [""] }),
    ).toThrow(/prerequisite/i);
  });
  it("rejects a direct self prerequisite", () => {
    expect(() => assertAcyclicPrerequisites("a", ["a"], [])).toThrow(
      /cycle|itself|own/i,
    );
  });
  it("rejects indirect and reachable non-root cycles", () => {
    expect(() =>
      assertAcyclicPrerequisites(
        "a",
        ["b"],
        [
          { courseId: "b", requiredCourseId: "c" },
          { courseId: "c", requiredCourseId: "a" },
        ],
      ),
    ).toThrow(/cycle/i);
    expect(() =>
      assertAcyclicPrerequisites(
        "a",
        ["b"],
        [
          { courseId: "b", requiredCourseId: "c" },
          { courseId: "c", requiredCourseId: "b" },
        ],
      ),
    ).toThrow(/cycle/i);
  });
  it("replaces the edited course edges and accepts a shared acyclic dependency", () => {
    expect(() =>
      assertAcyclicPrerequisites(
        "a",
        ["b", "c"],
        [
          { courseId: "a", requiredCourseId: "old" },
          { courseId: "b", requiredCourseId: "d" },
          { courseId: "c", requiredCourseId: "d" },
        ],
      ),
    ).not.toThrow();
  });
});
