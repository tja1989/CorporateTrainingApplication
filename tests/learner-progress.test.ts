import { describe, expect, it } from "vitest";
import { videoHeartbeat, clampVideoPosition } from "@/lib/lms/video-progress";

describe("video resume and watched coverage", () => {
  it("rejects invalid positions and clamps a valid position to the video", () => {
    for (const input of [NaN, Infinity, "15", null, undefined]) expect(clampVideoPosition(input, 100)).toBeNull();
    expect(clampVideoPosition(-12, 100)).toBe(0);
    expect(clampVideoPosition(900, 100)).toBe(100);
  });
  it("stores a seek position without inventing watched buckets between positions", () => {
    const result = videoHeartbeat([0, 1], 95, 100);
    expect(result.lastPositionSec).toBe(95);
    expect(result.watchedBuckets).toEqual([0, 1, 19]);
    expect(result.coveragePct).toBe(15);
    expect(result.complete).toBe(false);
  });
  it("deduplicates coverage and completes only at ninety percent", () => {
    expect(videoHeartbeat([0, 0, 1, 999], 5, 100).coveragePct).toBe(10);
    expect(videoHeartbeat(Array.from({ length: 17 }, (_, i) => i), 85, 100).complete).toBe(true);
    expect(videoHeartbeat([], 100, 100).watchedBuckets).toEqual([19]);
  });
});
