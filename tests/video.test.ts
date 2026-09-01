import { describe, expect, it } from "vitest";
import { parseSrtVtt } from "@/lib/video/transcript";
import { chunkTranscript } from "@/lib/video/chunk";

const SRT = `1
00:00:00,000 --> 00:00:05,500
Hello and welcome to the training.

2
00:00:05,500 --> 00:00:12,000
Today we cover the greeting standard.`;

const VTT = `WEBVTT

00:00.000 --> 00:04.000
First cue here.

00:04.000 --> 00:09.000
Second cue follows.`;

describe("SRT/VTT parsing (spec FR-5.2 manual provider)", () => {
  it("parses SRT with timestamps", () => {
    const snippets = parseSrtVtt(SRT);
    expect(snippets).toHaveLength(2);
    expect(snippets[0].start).toBe(0);
    expect(snippets[1].start).toBeCloseTo(5.5);
    expect(snippets[1].text).toContain("greeting standard");
  });
  it("parses WebVTT", () => {
    const snippets = parseSrtVtt(VTT);
    expect(snippets).toHaveLength(2);
    expect(snippets[1].start).toBe(4);
  });
});

describe("chunking preserves timestamps (spec FR-5.3)", () => {
  it("carries start/end seconds and never flattens", () => {
    const snippets = Array.from({ length: 40 }, (_, i) => ({
      text: `Sentence number ${i} contains a reasonable amount of words to accumulate tokens quickly for testing.`,
      start: i * 10,
      duration: 10,
    }));
    const chunks = chunkTranscript(snippets, { min: 100, max: 200, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.endSec).toBeGreaterThan(chunk.startSec);
    }
    expect(chunks[0].startSec).toBe(0);
    expect(chunks[chunks.length - 1].endSec).toBe(400);
  });
});
