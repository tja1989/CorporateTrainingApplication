import { DEFAULT_TZ, zonedTimeToUtc } from "@/lib/time";

export type CoursePlanningInput = {
  startDate: string;
  endDate: string;
  folderPath: string;
  prerequisiteIds: string[];
};
export type ParsedCoursePlanning = {
  startsAt: Date | null;
  endsAt: Date | null;
  folderPath: string;
  prerequisiteIds: string[];
};

function calendarDate(value: string, end: boolean): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Enter a valid calendar date.");
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 9999 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    throw new Error("Enter a valid calendar date.");
  return end
    ? new Date(
        zonedTimeToUtc(year, month, day + 1, 0, 0, DEFAULT_TZ).getTime() - 1000,
      )
    : zonedTimeToUtc(year, month, day, 0, 0, DEFAULT_TZ);
}

export function normalizeFolderPath(value: string): string {
  if (/[\\\u0000-\u001f\u007f]/u.test(value))
    throw new Error(
      "Course folder names cannot contain backslashes or control characters.",
    );
  const text = value.normalize("NFC").trim();
  if (!text) return "";
  const segments = text.split("/").map((segment) => segment.trim());
  if (
    segments.length > 8 ||
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || segment.length > 80,
    )
  )
    throw new Error(
      "Use up to 8 course folder levels with names of 1–80 characters, separated by /.",
    );
  const path = segments.join("/");
  if (path.length > 640)
    throw new Error("Keep the course folder path within 640 characters.");
  return path;
}

export function parseCoursePlanning(
  input: CoursePlanningInput,
): ParsedCoursePlanning {
  const startsAt = calendarDate(input.startDate, false),
    endsAt = calendarDate(input.endDate, true);
  if (startsAt && endsAt && endsAt < startsAt)
    throw new Error("The course end date cannot precede its start date.");
  const prerequisiteIds = [
    ...new Set(input.prerequisiteIds.map((value) => value.trim())),
  ];
  if (
    prerequisiteIds.length > 50 ||
    prerequisiteIds.some(
      (value) =>
        !value || value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value),
    )
  )
    throw new Error("Choose up to 50 valid prerequisite courses.");
  return {
    startsAt,
    endsAt,
    folderPath: normalizeFolderPath(input.folderPath),
    prerequisiteIds,
  };
}

export function courseHasOpened(
  startsAt: Date | null | undefined,
  now = new Date(),
): boolean {
  return !startsAt || startsAt.getTime() <= now.getTime();
}

export function enrollmentDeadline(
  course: { startsAt: Date | null; endsAt: Date | null },
  explicit: Date | null,
): Date | null {
  const due = explicit ?? course.endsAt;
  if (
    due &&
    (!Number.isFinite(due.getTime()) ||
      (course.startsAt && due < course.startsAt))
  )
    throw new Error(
      "The assignment deadline must be on or after the course opens.",
    );
  return due;
}

export function assertAcyclicPrerequisites(
  courseId: string,
  requiredIds: string[],
  edges: { courseId: string; requiredCourseId: string }[],
): void {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.courseId === courseId) continue;
    graph.set(edge.courseId, [
      ...(graph.get(edge.courseId) ?? []),
      edge.requiredCourseId,
    ]);
  }
  graph.set(courseId, requiredIds);
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id))
      throw new Error(
        "Prerequisite courses cannot form a cycle or include the course itself.",
      );
    if (done.has(id)) return;
    visiting.add(id);
    for (const required of graph.get(id) ?? []) visit(required);
    visiting.delete(id);
    done.add(id);
  }
  visit(courseId);
}

export function folderChildren(
  courses: { folderPath: string }[],
  parent: string,
): { name: string; path: string; count: number }[] {
  const prefix = parent ? parent + "/" : "",
    counts = new Map<string, number>();
  for (const course of courses) {
    if (!course.folderPath.startsWith(prefix)) continue;
    const name = course.folderPath.slice(prefix.length).split("/")[0];
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, path: prefix + name, count }));
}
