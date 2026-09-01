import { describe, expect, it } from "vitest";
import { userMatchesRule, computeDueDate } from "@/lib/lms/rules";

const baseUser = {
  storeId: "store-1",
  groupIds: ["g-cashier"],
  jobTitle: "Cashier",
  hireDate: new Date("2026-01-15"),
  role: "LEARNER" as const,
};
const ancestry = ["store-1", "region-1", "country-uae"];

describe("rule matching (spec FR-3.1/3.2)", () => {
  it("matches on group", () => {
    expect(userMatchesRule(baseUser, { groupId: "g-cashier" }, ancestry)).toBe(true);
    expect(userMatchesRule(baseUser, { groupId: "g-pharmacy" }, ancestry)).toBe(false);
  });
  it("matches store/region/country via ancestry", () => {
    expect(userMatchesRule(baseUser, { store: "store-1" }, ancestry)).toBe(true);
    expect(userMatchesRule(baseUser, { region: "region-1" }, ancestry)).toBe(true);
    expect(userMatchesRule(baseUser, { country: "country-uae" }, ancestry)).toBe(true);
    expect(userMatchesRule(baseUser, { store: "store-9" }, ancestry)).toBe(false);
  });
  it("job title is case-insensitive", () => {
    expect(userMatchesRule(baseUser, { jobTitle: "cashier" }, ancestry)).toBe(true);
  });
  it("hire-date window", () => {
    expect(userMatchesRule(baseUser, { hiredAfter: "2026-01-01" }, ancestry)).toBe(true);
    expect(userMatchesRule(baseUser, { hiredAfter: "2026-02-01" }, ancestry)).toBe(false);
  });
});

describe("due-date computation (spec FR-3.1 hire-date guard)", () => {
  const now = new Date("2026-09-01T08:00:00Z");
  it("from_enrollment lands N days out end-of-day", () => {
    const due = computeDueDate({ kind: "from_enrollment", days: 14 }, baseUser, "Asia/Dubai", now)!;
    expect(due.getTime()).toBeGreaterThan(now.getTime() + 13 * 24 * 3600_000);
  });
  it("from_hire for a long-tenured user never lands in the past (floor = enrollment + 14d)", () => {
    const due = computeDueDate({ kind: "from_hire", days: 30 }, baseUser, "Asia/Dubai", now)!;
    expect(due.getTime()).toBeGreaterThan(now.getTime()); // hire+30 = Feb, floored forward
    expect(due.getTime()).toBeGreaterThanOrEqual(now.getTime() + 13 * 24 * 3600_000);
  });
  it("from_hire for a recent hire uses hire + N", () => {
    const recent = { ...baseUser, hireDate: new Date("2026-08-25") };
    const due = computeDueDate({ kind: "from_hire", days: 60 }, recent, "Asia/Dubai", now)!;
    expect(due.getTime()).toBeGreaterThan(now.getTime() + 50 * 24 * 3600_000);
  });
});
