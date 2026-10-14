import { expect, it, vi } from "vitest";
vi.mock("@/lib/db/client", async () => ({
  t: await import("../lib/db/schema"),
  db: {},
}));
import {
  previousFeedbackPeriod,
  feedbackDigestKey,
} from "../lib/feedback/digests";
import { renderNotification } from "../lib/notify";
it("digests summarize just-finished organization-time periods", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const week = previousFeedbackPeriod("week", now);
  expect(week.start.toISOString()).toBe("2026-10-04T20:00:00.000Z");
  expect(week.end.toISOString()).toBe("2026-10-11T20:00:00.000Z");
  const month = previousFeedbackPeriod("month", now);
  expect(month.start.toISOString()).toBe("2026-08-31T20:00:00.000Z");
  expect(month.end.toISOString()).toBe("2026-09-30T20:00:00.000Z");
});
it("dedupe distinguishes feedback type and weekly/monthly windows with the same start", () => {
  const date = new Date("2026-06-01Z");
  const keys = [
    feedbackDigestKey("week", "course", "u", date),
    feedbackDigestKey("week", "instructor", "u", date),
    feedbackDigestKey("month", "course", "u", date),
  ];
  expect(new Set(keys).size).toBe(3);
});
it("dedicated templates label no responses without inventing a zero-star average", () => {
  const rendered = renderNotification("course_feedback_digest", {
    intervalKind: "week",
    period: "Last week",
    responses: 0,
    average: null,
  });
  expect(rendered.title).toBe("Weekly course feedback");
  expect(rendered.body).toContain("No responses");
  expect(rendered.body).not.toContain("0 / 5");
});
