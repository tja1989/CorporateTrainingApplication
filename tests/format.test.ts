import { describe, expect, it } from "vitest";
import { calendarDaysBetween, formatDateTime, formatDay, formatDue, formatRelative, languageName, noun, plural, tagLabel, zoneLabel } from "../lib/format";

const now = new Date("2026-10-14T06:00:00Z"); // Wed 14 Oct, 10:00 Dubai

describe("dates", () => {
  it("formats calendar days in Dubai time and adds the year only when it differs", () => {
    expect(formatDay(new Date("2026-10-17T05:30:00Z"), { now })).toBe("Sat 17 Oct");
    expect(formatDay(new Date("2027-01-01T05:30:00Z"), { now })).toBe("Fri 1 Jan 2027");
    expect(formatDay(new Date("2026-10-17T20:30:00Z"), { now })).toBe("Sun 18 Oct"); // 00:30 Dubai next day
  });
  it("formats date-times on a 24-hour clock", () => {
    expect(formatDateTime(new Date("2026-10-17T05:30:00Z"), { now })).toBe("Sat 17 Oct, 09:30");
  });
  it("counts calendar days in Dubai, not elapsed 24h blocks", () => {
    expect(calendarDaysBetween(new Date("2026-10-17T19:30:00Z"), new Date("2026-10-17T19:59:59Z"))).toBe(0);
    expect(calendarDaysBetween(new Date("2026-10-17T19:30:00Z"), new Date("2026-10-17T20:30:00Z"))).toBe(1);
  });
  it("phrases due dates", () => {
    expect(formatDue(new Date("2026-10-14T19:59:59Z"), { now })).toBe("Due today");
    expect(formatDue(new Date("2026-10-15T12:00:00Z"), { now })).toBe("Due tomorrow");
    expect(formatDue(new Date("2026-10-17T19:59:59Z"), { now })).toBe("Due Sat 17 Oct, in 3 days");
    expect(formatDue(new Date("2026-10-13T12:00:00Z"), { now })).toBe("Overdue by 1 day");
    expect(formatDue(new Date("2026-10-09T12:00:00Z"), { now })).toBe("Overdue by 5 days");
    expect(formatDue(new Date("2026-10-17T19:30:00Z"), { now: new Date("2026-10-17T19:30:00Z") })).toBe("Due today"); // 23:30 Dubai
  });
  it("phrases relative times", () => {
    expect(formatRelative(new Date(now.getTime() - 20_000), { now })).toBe("Just now");
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000), { now })).toBe("5 min ago");
    expect(formatRelative(new Date(now.getTime() - 2 * 3_600_000), { now })).toBe("2 h ago");
    expect(formatRelative(new Date("2026-10-13T06:00:00Z"), { now })).toBe("Yesterday");
    expect(formatRelative(new Date("2026-10-09T06:00:00Z"), { now })).toBe("Fri 9 Oct");
  });
});

describe("words", () => {
  it("pluralizes counts and nouns", () => {
    expect(plural(1, "assignment")).toBe("1 assignment");
    expect(plural(0, "attempt")).toBe("0 attempts");
    expect(plural(2, "person", "people")).toBe("2 people");
    expect(noun(1, "course")).toBe("course");
    expect(noun(4, "course")).toBe("courses");
  });
  it("names languages without throwing", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("ml")).toBe("Malayalam");
    expect(languageName("xx")).toBe("XX");
    expect(languageName("")).toBe("Not set");
    expect(languageName(null)).toBe("Not set");
  });
  it("humanizes tags and zones", () => {
    expect(tagLabel("fresh-food")).toBe("Fresh food");
    expect(tagLabel("POS")).toBe("POS");
    expect(zoneLabel("Asia/Dubai")).toBe("Dubai time");
    expect(zoneLabel("America/New_York")).toBe("New York time");
  });
});
