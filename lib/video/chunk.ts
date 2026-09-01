import type { CaptionSnippet } from "./transcript";

export type TimedChunk = { text: string; startSec: number; endSec: number };

const approxTokens = (s: string) => Math.ceil(s.split(/\s+/).length / 0.75);

/**
 * Merge caption snippets into 300–600-token chunks with ~50-token overlap,
 * breaking at utterance boundaries, carrying start/end seconds (spec FR-5.3).
 */
export function chunkTranscript(snippets: CaptionSnippet[], opts?: { min?: number; max?: number; overlap?: number }): TimedChunk[] {
  const MIN = opts?.min ?? 300;
  const MAX = opts?.max ?? 600;
  const OVERLAP = opts?.overlap ?? 50;
  const chunks: TimedChunk[] = [];
  let current: CaptionSnippet[] = [];
  let tokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      text: current.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim(),
      startSec: Math.floor(current[0].start),
      endSec: Math.ceil(current[current.length - 1].start + current[current.length - 1].duration),
    });
    // seed overlap from the tail
    let overlapTokens = 0;
    const tail: CaptionSnippet[] = [];
    for (let i = current.length - 1; i >= 0 && overlapTokens < OVERLAP; i--) {
      tail.unshift(current[i]);
      overlapTokens += approxTokens(current[i].text);
    }
    current = tail;
    tokens = overlapTokens;
  };

  for (const snip of snippets) {
    current.push(snip);
    tokens += approxTokens(snip.text);
    const endsUtterance = /[.!?…]\s*$/.test(snip.text);
    if (tokens >= MAX || (tokens >= MIN && endsUtterance)) flush();
  }
  // final flush without overlap seeding
  if (current.length > 0 && tokens > 0) {
    const text = current.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    const last = chunks[chunks.length - 1];
    if (!last || !last.text.endsWith(text)) {
      chunks.push({
        text,
        startSec: Math.floor(current[0].start),
        endSec: Math.ceil(current[current.length - 1].start + current[current.length - 1].duration),
      });
    }
  }
  return chunks.filter((c) => c.text.length > 0);
}
