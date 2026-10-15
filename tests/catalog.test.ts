import { describe, expect, it } from "vitest";
import {
  parseCatalogQuery,
  filterCatalog,
  catalogHref,
} from "@/lib/lms/catalog";
const courses = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  title: `Food ${String(i).padStart(2, "0")}`,
  description: "Safe service",
  tags: i % 2 ? ["service"] : ["safety"],
  language: i % 2 ? "ar" : "en",
  estMinutes: i < 10 ? 10 : 45,
  status: i === 24 ? "DRAFT" : "PUBLISHED",
}));
const enrollment = new Map([
  ["0", "IN_PROGRESS"],
  ["2", "COMPLETED"],
]);
describe("addressable course catalog", () => {
  it("keeps Upcoming scoped to assigned incomplete future courses and orders opening dates", () => {
    const rows = [
      {
        ...courses[0],
        id: "later",
        startsAt: new Date("2031-10-22Z"),
        folderPath: "Ops/Safety",
      },
      {
        ...courses[0],
        id: "first",
        startsAt: new Date("2031-10-20Z"),
        folderPath: "Ops/Safety/Food",
      },
      {
        ...courses[0],
        id: "foreign",
        startsAt: new Date("2031-10-19Z"),
        folderPath: "Ops/Safety",
      },
      {
        ...courses[0],
        id: "done",
        startsAt: new Date("2031-10-19Z"),
        folderPath: "Ops/Safety",
      },
      {
        ...courses[0],
        id: "open",
        startsAt: new Date("2020-10-19Z"),
        folderPath: "Ops/Safety",
      },
    ];
    const assigned = new Map([
      ["later", "NOT_STARTED"],
      ["first", "NOT_STARTED"],
      ["done", "COMPLETED"],
      ["open", "IN_PROGRESS"],
    ]);
    const query = parseCatalogQuery({ view: "upcoming", folder: "Ops/Safety" });
    expect(query.view).toBe("upcoming");
    expect(
      filterCatalog(
        rows,
        assigned,
        query,
        12,
        new Date("2026-10-15Z"),
      ).items.map((c) => c.id),
    ).toEqual(["first", "later"]);
    expect(catalogHref(query)).toContain("folder=Ops%2FSafety");
  });
  it("filters folder descendants on segment boundaries and keeps URL state", () => {
    const rows = [
      { ...courses[0], id: "inside", folderPath: "Ops/Safety/Food" },
      { ...courses[0], id: "sibling", folderPath: "Ops/Safetyware" },
    ];
    const query = parseCatalogQuery({ view: "browse", folder: "Ops/Safety" });
    expect(
      filterCatalog(rows, new Map(), query).items.map((c) => c.id),
    ).toEqual(["inside"]);
    expect(catalogHref(query, { page: 2 })).toContain("folder=Ops%2FSafety");
  });
  it("routes q to browse and normalizes malformed inputs", () => {
    expect(
      parseCatalogQuery({
        q: " food ",
        view: "mine",
        page: "-2",
        duration: "invalid",
      }),
    ).toMatchObject({ q: "food", view: "browse", page: 1, duration: "" });
    expect(parseCatalogQuery({ page: "1.5", sort: "bad" })).toMatchObject({
      page: 1,
      sort: "title",
    });
  });
  it("combines filters with enrollment without exposing drafts", () => {
    const query = parseCatalogQuery({
      view: "browse",
      q: "food",
      tag: "safety",
      language: "en",
      duration: "short",
      status: "COMPLETED",
    });
    expect(
      filterCatalog(courses, enrollment, query).items.map((c) => c.id),
    ).toEqual(["2"]);
  });
  it("counts before paging, bounds stale page values, and preserves URL state", () => {
    const query = parseCatalogQuery({
      view: "browse",
      page: "3",
      tag: "safety",
    });
    const result = filterCatalog(courses, enrollment, query, 5);
    expect(result.total).toBe(12);
    expect(result.pages).toBe(3);
    expect(result.items.map((c) => c.id)).toEqual(["20", "22"]);
    expect(
      filterCatalog(courses, enrollment, { ...query, page: 999 }, 5).page,
    ).toBe(3);
    expect(catalogHref(query, { page: 2 })).toContain("tag=safety");
    expect(catalogHref(query, { page: 2 })).toContain("page=2");
  });
  it("keeps My courses scoped to enrolled published courses", () => {
    expect(
      filterCatalog(courses, enrollment, parseCatalogQuery({})).items.map(
        (c) => c.id,
      ),
    ).toEqual(["0", "2"]);
  });
});
