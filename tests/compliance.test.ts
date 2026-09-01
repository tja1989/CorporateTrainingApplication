import { describe, expect, it } from "vitest";
import { computeComplianceStatus } from "@/lib/lms/compliance";

const now = new Date("2026-09-01T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 24 * 3600_000);

describe("compliance state machine (spec FR-3.3)", () => {
  it("ON_TRACK when incomplete and due far out", () => {
    expect(computeComplianceStatus({ status: "NOT_STARTED", dueAt: days(30), certificateExpiresAt: null, now })).toBe("ON_TRACK");
  });
  it("DUE_SOON at exactly 7 days", () => {
    expect(computeComplianceStatus({ status: "IN_PROGRESS", dueAt: days(7), certificateExpiresAt: null, now })).toBe("DUE_SOON");
  });
  it("OVERDUE takes precedence over everything", () => {
    expect(computeComplianceStatus({ status: "NOT_STARTED", dueAt: days(-1), certificateExpiresAt: days(5), now })).toBe("OVERDUE");
  });
  it("no due date → ON_TRACK", () => {
    expect(computeComplianceStatus({ status: "NOT_STARTED", dueAt: null, certificateExpiresAt: null, now })).toBe("ON_TRACK");
  });
  it("COMPLETED with far-future cert", () => {
    expect(computeComplianceStatus({ status: "COMPLETED", dueAt: days(-100), certificateExpiresAt: days(300), now })).toBe("COMPLETED");
  });
  it("COMPLETED_EXPIRING inside the 30-day window", () => {
    expect(computeComplianceStatus({ status: "COMPLETED", dueAt: null, certificateExpiresAt: days(29), now })).toBe("COMPLETED_EXPIRING");
  });
  it("EXPIRED once the cert lapses without recert", () => {
    expect(computeComplianceStatus({ status: "COMPLETED", dueAt: null, certificateExpiresAt: days(-1), now })).toBe("EXPIRED");
  });
  it("recert completion suppresses EXPIRED on the old enrollment", () => {
    expect(
      computeComplianceStatus({ status: "COMPLETED", dueAt: null, certificateExpiresAt: days(-1), recertCompleted: true, now }),
    ).toBe("COMPLETED");
  });
  it("WITHDRAWN is terminal", () => {
    expect(computeComplianceStatus({ status: "WITHDRAWN", dueAt: days(-5), certificateExpiresAt: null, now })).toBe("WITHDRAWN");
  });
});
