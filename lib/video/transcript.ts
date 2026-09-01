/**
 * Transcript acquisition (spec FR-5.2), behind a swappable provider interface.
 * Providers: manual SRT/VTT upload (always available, fully lawful — the MVP
 * default), hosted vendor (demo-only; shifts ToS exposure), and — production —
 * the LuLu-owned-channel captions.download OAuth flow (fast-follow).
 */

export type CaptionSnippet = { text: string; start: number; duration: number };

export interface TranscriptProvider {
  name: "manual" | "vendor";
  fetchTranscript(input: { youtubeId?: string; raw?: string }): Promise<{ snippets: CaptionSnippet[]; lang: string; isGenerated: boolean }>;
}

function parseTimestamp(ts: string): number {
  // 00:01:02,500 or 00:01:02.500 or 01:02.500
  const clean = ts.trim().replace(",", ".");
  const parts = clean.split(":").map(Number.parseFloat);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

/** Parse SRT or WebVTT into caption snippets. */
export function parseSrtVtt(raw: string): CaptionSnippet[] {
  const text = raw.replace(/^﻿/, "").replace(/\r/g, "");
  const out: CaptionSnippet[] = [];
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx < 0) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split("-->");
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw.split(" ")[1] ?? endRaw);
    const content = lines
      .slice(timeLineIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!content) continue;
    out.push({ text: content, start, duration: Math.max(0.5, end - start) });
  }
  return out;
}

export const manualProvider: TranscriptProvider = {
  name: "manual",
  async fetchTranscript({ raw }) {
    if (!raw) throw new Error("Manual provider requires an uploaded SRT/VTT transcript");
    const snippets = parseSrtVtt(raw);
    if (snippets.length === 0) throw new Error("Could not parse any captions from the uploaded file");
    return { snippets, lang: "en", isGenerated: false };
  },
};

/**
 * Hosted vendor provider (Supadata-class). DEMO/PILOT ONLY — these services
 * scrape YouTube; the ToS exposure is shifted, not eliminated (spec FR-5.2).
 */
export const vendorProvider: TranscriptProvider = {
  name: "vendor",
  async fetchTranscript({ youtubeId }) {
    const key = process.env.SUPADATA_API_KEY;
    if (!key) throw new Error("Vendor transcript provider not configured (SUPADATA_API_KEY)");
    if (!youtubeId) throw new Error("Vendor provider requires a YouTube video id");
    const res = await fetch(`https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(youtubeId)}`, {
      headers: { "x-api-key": key },
    });
    if (!res.ok) throw new Error(`Vendor transcript fetch failed: ${res.status}`);
    const data = (await res.json()) as { lang?: string; content: Array<{ text: string; offset: number; duration: number }> };
    return {
      snippets: data.content.map((c) => ({ text: c.text, start: c.offset / 1000, duration: c.duration / 1000 })),
      lang: data.lang ?? "en",
      isGenerated: true,
    };
  },
};

export function getProvider(name?: string): TranscriptProvider {
  return name === "vendor" ? vendorProvider : manualProvider;
}
