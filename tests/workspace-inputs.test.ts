import { describe, expect, it } from "vitest";
import { parsePeopleCsv, parseCoverUrl, parseDays } from "../lib/workspace-inputs";
describe("workspace authoring inputs", () => {
  it("preserves an empty cover as null and accepts local or HTTPS images", () => {
    expect(parseCoverUrl(" ")).toEqual({ value: null });
    expect(parseCoverUrl("/images/course.png")).toEqual({ value: "/images/course.png" });
    expect(parseCoverUrl("https://example.test/image.jpg")).toEqual({ value: "https://example.test/image.jpg" });
    for (const value of ["javascript:alert(1)", "//example.test/a", "data:image/svg+xml,x"]) expect(parseCoverUrl(value)).toHaveProperty("error");
  });
  it("rejects invalid due windows instead of persisting an invalid date", () => {
    for (const value of ["NaN", "0", "-3", "1.5", "Infinity"]) expect(parseDays(value)).toHaveProperty("error");
    expect(parseDays("14")).toEqual({ value: 14 });
  });
  it("retains valid CSV rows while reporting exact invalid row numbers", () => {
    const result = parsePeopleCsv('employeeId,name,role,storeName,groupName,jobTitle,hireDate,managerEmployeeId\nE1,"Doe, Jane",LEARNER,,,,2026-09-01,\nE2,Name,SUPERUSER,,,,,\nE3,Name,LEARNER,,,,bad-date,\nE1,Duplicate,LEARNER,,,,,');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ employeeId: "E1", name: "Doe, Jane", row: 2 });
    expect(result.errors.map(e => e.row)).toEqual([3,4,5]);
  });
  it("reports malformed and blank identity rows without importing them", () => {
    const result = parsePeopleCsv(',,LEARNER\nE1,OnlyTwo\nE2,"unfinished,LEARNER');
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(3);
  });
});
