import { describe, expect, it } from "vitest";
import { validateCitations } from "@/lib/ai/tutor";
import { resolveTutorCitations } from "@/lib/ai/tutor-sources";

const sources = [{ videoId: "video-a", lessonId: "lesson-a", lessonTitle: "Source A", durationSec: 90 }];
describe("tutor source identity", () => {
  it("does not guess an old or foreign citation destination", () => {
    const old = { startSec: 10, endSec: 15, quote: "Retained historical text" };
    expect(resolveTutorCitations([old], sources)).toEqual([old]);
    expect(resolveTutorCitations([{ ...old, videoId: "foreign", lessonId: "injected" }], sources)[0].lessonId).toBeUndefined();
    expect(resolveTutorCitations([{ ...old, videoId: "video-a", startSec: 100 }], sources)[0].lessonId).toBeUndefined();
  });
  it("derives the destination from allowed sources instead of accepting supplied links", () => {
    expect(resolveTutorCitations([{ startSec: 10, endSec: 15, quote: "Source", videoId: "video-a", lessonId: "foreign" }], sources)[0]).toMatchObject({ lessonId: "lesson-a", lessonTitle: "Source A" });
  });
  it("rejects ambiguous timestamps and out-of-scope video IDs", () => {
    const chunks = [{ videoId: "a", startSec: 0, endSec: 20 }, { videoId: "b", startSec: 0, endSec: 20 }];
    expect(validateCitations([{ startSec: 10, endSec: 15, quote: "ambiguous" }], chunks)).toEqual([]);
    expect(validateCitations([{ startSec: 10, endSec: 15, quote: "foreign", videoId: "c" }], chunks)).toEqual([]);
    expect(validateCitations([{ startSec: 10, endSec: 15, quote: "correct", videoId: "b" }], chunks)[0].videoId).toBe("b");
  });
});
