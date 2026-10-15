import { describe, expect, it } from "vitest";
import { workflowSteps } from "../lib/courses/workflow-steps";

const current = (status: string, approvalState: string) => workflowSteps({ status, approvalState }).find(s => s.state === "current")?.key;

describe("approval stepper", () => {
  it.each([
    ["DRAFT", "DRAFT", "draft"],
    ["DRAFT", "REJECTED", "draft"],
    ["DRAFT", "SUBMITTED", "review"],
    ["DRAFT", "APPROVED", "publish"],
    ["ARCHIVED", "APPROVED", "publish"],
    ["PUBLISHED", "APPROVED", "live"],
    ["PUBLISHED", "LEGACY_PUBLISHED", "live"],
    ["PUBLISHED", "DRAFT", "draft"],
  ])("a %s course in %s sits at %s", (status, approval, step) => expect(current(status, approval)).toBe(step));
  it("marks earlier steps done and later steps upcoming", () => {
    expect(workflowSteps({ status: "DRAFT", approvalState: "SUBMITTED" }).map(s => s.state)).toEqual(["done", "current", "upcoming", "upcoming"]);
  });
  it("names the steps in plain words", () => {
    expect(workflowSteps({ status: "DRAFT", approvalState: "DRAFT" }).map(s => s.label)).toEqual(["Draft", "Department review", "HR publishes", "Live"]);
  });
  it("says when changes were requested", () => {
    expect(workflowSteps({ status: "DRAFT", approvalState: "REJECTED" })[0].note).toBe("Changes requested");
  });
});
