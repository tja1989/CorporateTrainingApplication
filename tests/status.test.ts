import { describe, expect, it } from "vitest";
import { isKnownStatus, statusLabel } from "../lib/status";

describe("status vocabulary", () => {
  it.each([
    ["ON_TRACK", "On track", "neutral"], ["DUE_SOON", "Due soon", "warning"], ["OVERDUE", "Overdue", "destructive"],
    ["COMPLETED", "Completed", "success"], ["COMPLETED_EXPIRING", "Expiring soon", "warning"], ["EXPIRED", "Expired", "destructive"],
    ["DRAFT", "Draft", "neutral"], ["SUBMITTED", "Awaiting approval", "warning"], ["APPROVED", "Approved", "success"],
    ["REJECTED", "Changes requested", "destructive"], ["LEGACY_PUBLISHED", "Published before approvals", "neutral"],
    ["PUBLISHED", "Published", "success"], ["ARCHIVED", "Archived", "neutral"], ["READY", "Ready", "success"],
    ["FAILED", "Failed", "destructive"], ["EMBEDDING", "Processing", "neutral"], ["INACTIVE", "Inactive", "warning"],
  ])("%s reads %s", (status, label, tone) => expect(statusLabel(status)).toEqual({ label, tone }));
  it("humanizes values it does not know yet", () => {
    expect(statusLabel("ON_HOLD")).toEqual({ label: "On hold", tone: "neutral" });
    expect(isKnownStatus("ON_HOLD")).toBe(false);
  });
  it("only claims exact status strings", () => {
    expect(isKnownStatus("OVERDUE")).toBe(true);
    expect(isKnownStatus("Overdue")).toBe(false);
    expect(isKnownStatus(12)).toBe(false);
  });
});
