import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoLessonClient } from "../app/(learner)/lesson/[lessonId]/video-client";

const props = { lessonId: "l1", youtubeId: "abc", videoId: "v1", chunks: [], initialMessages: [], initialThreadId: null, initialCompleted: false, initialPositionSec: 0, initialCoverage: 0, durationSec: 86, title: "Handwashing that protects", courseTitle: "Food Safety Essentials", courseTags: [] };

describe("video poster", () => {
  it("shows a branded play button over a player that is already mounted", () => {
    const html = renderToStaticMarkup(createElement(VideoLessonClient, props));
    expect(html).toContain('aria-label="Play video: Handwashing that protects"');
    expect(html).toMatch(/cover-field-1/);
    expect(html).toContain('data-player-host="true"');
  });
  it("tells a returning learner where playback resumes", () => {
    expect(renderToStaticMarkup(createElement(VideoLessonClient, { ...props, initialPositionSec: 85 }))).toContain("Resume from 1:25");
  });
});
