import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { VideoLessonClient, hidesPoster } from "../app/(learner)/lesson/[lessonId]/video-client";
import { quizIntroFigures } from "../lib/quiz/intro-figures";
import { NUDGE_WINDOW_MS, nudgeKey, nudgedRecently } from "../lib/nudge";
import { workflowSteps, workflowLabel, readOnlyReason } from "../lib/courses/workflow-steps";

const source = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const css = source("app/globals.css");
const videoProps = { lessonId: "l1", youtubeId: "abc", videoId: "v1", chunks: [], initialMessages: [], initialThreadId: null, initialCompleted: false, initialPositionSec: 85, initialCoverage: 0, durationSec: 86, title: "Handwashing that protects", courseTitle: "Food Safety Essentials", courseTags: [] };

describe("final review fixes", () => {
  it("drops the poster whenever the player actually starts (resume seek can autoplay)", () => {
    expect([1, 3].map(hidesPoster)).toEqual([true, true]); // playing, buffering
    expect([-1, 0, 2, 5].map(hidesPoster)).toEqual([false, false, false, false]); // unstarted, ended, paused, cued
    expect(source("app/(learner)/lesson/[lessonId]/video-client.tsx")).toMatch(/onStateChange:[\s\S]{0,60}hidesPoster\(/);
  });

  it("keeps a visible focus ring on the poster inside its clipped frame", () => {
    expect(renderToStaticMarkup(createElement(VideoLessonClient, videoProps))).toMatch(/<button[^>]*class="video-poster /);
    expect(css).toMatch(/\.video-poster:focus-visible\s*\{[^}]*outline-offset:\s*-\d+px/);
  });

  it("shows the learner's own time limit and attempts left before a quiz", () => {
    const settings = { timeLimitSec: 1200, attemptsLimit: 3, passPct: 70 };
    expect(quizIntroFigures(settings, 1.5, 2)).toEqual([["Time limit", "30 min"], ["Attempts left", "1 of 3"], ["Pass mark", "70%"]]);
    expect(quizIntroFigures({ timeLimitSec: null, attemptsLimit: null, passPct: 80 }, 1, 4)).toEqual([["Time limit", "None"], ["Attempts left", "Unlimited"], ["Pass mark", "80%"]]);
    expect(quizIntroFigures(settings, 1, 5)[1]).toEqual(["Attempts left", "0 of 3"]);
  });

  it("knows when a team member was reminded in the last 48 hours", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(NUDGE_WINDOW_MS).toBe(48 * 3600_000);
    expect(nudgeKey("u1")).toBe("nudge:u1");
    expect(nudgedRecently(new Date("2026-10-14T12:00:00Z"), now)).toBe(true);
    expect(nudgedRecently(new Date("2026-10-13T11:00:00Z"), now)).toBe(false);
    expect(nudgedRecently(undefined, now)).toBe(false);
  });

  it("never shows an archived course as live or waiting to publish", () => {
    for (const approvalState of ["LEGACY_PUBLISHED", "APPROVED"]) {
      const steps = workflowSteps({ status: "ARCHIVED", approvalState });
      expect(steps.some((s) => s.state === "current")).toBe(false);
      expect(workflowLabel({ status: "ARCHIVED", approvalState })).toBe("Archived");
      expect(readOnlyReason({ status: "ARCHIVED", approvalState })).toMatch(/^Archived\./);
    }
    expect(workflowLabel({ status: "PUBLISHED", approvalState: "APPROVED" })).toBe("Published · approved");
    expect(workflowLabel({ status: "DRAFT", approvalState: "APPROVED" })).toBe("Approved for publication");
    expect(readOnlyReason({ status: "PUBLISHED", approvalState: "APPROVED" })).toBe("Published. Revise this course to make changes.");
  });

  it("keeps card edges and elevation visible in dark mode", () => {
    const dark = css.match(/\n\.dark\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(dark).toMatch(/--shadow-resting:/);
    expect(dark).toMatch(/--shadow-raised:/);
    expect(css).not.toMatch(/\.card-interactive:hover\s*\{[^}]*border-color:\s*transparent/);
  });
  it("reloads the team list after a reminder so the flash and the 48-hour state show", () => {
    // This app refreshes after actions with WorkspaceForm (a full reload); a plain <form action> left the row unchanged.
    const team = source("app/(workspace)/team/page.tsx");
    expect(team).toMatch(/<WorkspaceForm action=\{nudgeAction\.bind/);
    expect(team).not.toMatch(/<form action=\{nudgeAction/);
  });
});
