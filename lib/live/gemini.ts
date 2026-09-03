import { GoogleGenAI, type LiveConnectConfig } from "@google/genai";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import type { LiveUsage } from "./shared";

/**
 * Gemini Live gateway (spec FR-14.1/14.5): ephemeral-token minting, runtime
 * model resolution and cost logging. The API key never leaves this module.
 */

export const LIVE_PROMPT_VERSION = "live-v1";

/** Preferred Live-capable models, most capable first. Overridable with GEMINI_LIVE_MODEL. */
export const LIVE_MODEL_CANDIDATES = [
  "gemini-2.5-flash-native-audio-latest",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-live-2.5-flash-preview",
  "gemini-2.0-flash-live-001",
] as const;

export const LIVE_VOICE = process.env.GEMINI_LIVE_VOICE ?? "Kore";

/**
 * The language the spoken sessions are conducted in (BCP-47). Passed to the
 * Live API as a transcription hint: without it the transcriber auto-detects
 * per utterance and a learner speaking accented English is regularly
 * transcribed into another language entirely.
 */
export const LIVE_LANGUAGE = process.env.GEMINI_LIVE_LANGUAGE ?? "en-US";

/** Approximate Gemini Live list prices in $/MTok — the one place to adjust (spec FR-13.7). */
export const LIVE_PRICES = { textIn: 0.5, audioIn: 3.0, textOut: 2.0, audioOut: 12.0 } as const;

export class LiveUnavailableError extends Error {}

export function liveAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

let alphaClient: GoogleGenAI | null = null;
let stableClient: GoogleGenAI | null = null;

/** v1alpha client — required for ephemeral tokens and constrained Live sessions. */
export function liveClient(): GoogleGenAI {
  if (!alphaClient) alphaClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  return alphaClient;
}

/** Default-version client for ordinary text calls (fallback evaluation). */
export function textClient(): GoogleGenAI {
  if (!stableClient) stableClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return stableClient;
}

const stripPrefix = (m: string) => m.replace(/^models\//, "");

/** Pure model choice: an explicit override wins; else the first candidate the key can use. */
export function pickLiveModel(available: string[], override?: string | null): { model: string | null; warning?: string } {
  const set = new Set(available.map(stripPrefix));
  if (override?.trim()) {
    const m = stripPrefix(override.trim());
    // A pin is explicit intent, so it is honoured either way — but a model that
    // cannot speak will refuse the session, and that is worth saying up front
    // rather than leaving it to a mid-call disconnect.
    if (!isConversationalLiveModel(m)) {
      return { model: m, warning: `GEMINI_LIVE_MODEL "${m}" is a task-specialised model, not a voice agent — it will refuse or derail an audio session.` };
    }
    if (set.size === 0 || set.has(m)) return { model: m };
    return { model: m, warning: `GEMINI_LIVE_MODEL "${m}" is not in this key's model list — trying it anyway.` };
  }
  if (set.size === 0) return { model: LIVE_MODEL_CANDIDATES[0], warning: "Model list unavailable — using the default Live model." };
  // Prefer whatever the key actually exposes, ranked — so a newer native-audio
  // family is picked up the day it ships, without editing the candidate list.
  const best = [...set].sort((a, b) => scoreLiveModel(b) - scoreLiveModel(a))[0];
  const bestScore = scoreLiveModel(best);
  // A curated id is vouched for even when it scores 0 (the `gemini-live-2.5-flash`
  // shape is not native-audio), so it wins any tie and every all-zero list.
  const curated = LIVE_MODEL_CANDIDATES.find((c) => set.has(c));
  if (curated && scoreLiveModel(curated) >= bestScore) return { model: curated };
  if (bestScore > 0) return { model: best };
  return { model: null, warning: "This API key exposes no Live model fit to hold a voice session — only task-specialised families (transcription, translation) or unrecognised ones." };
}

/**
 * Task-specialised families that stream over `bidiGenerateContent` but are not
 * voice agents. `models.list` reports no response modalities and the SDK's Model
 * type carries none, so the id is the only signal there is. A transcriber
 * refuses an audio session outright ("response modalities (AUDIO) is not
 * supported by the model"); a translator would answer, in the wrong job.
 */
const SPECIALISED = /transcribe|transcription|translate|translation|\btts\b|embedding|image|vision|guard|rerank/;

/**
 * The marker Google puts on its conversational native-audio dialog models, and
 * the only thing we adopt on sight. Every other id has to be vouched for by
 * LIVE_MODEL_CANDIDATES.
 *
 * This is deliberately an allow-list. Treating "the id contains live" as proof
 * of a voice agent, then ranking on generation, twice picked a specialised 3.5
 * family over a working 2.5 one — the newest thing on the list is not the same
 * as the right thing. An unrecognised shape now scores 0 and the curated list
 * stays in charge, which costs a config change the day a new family ships and
 * saves a demo that dies mid-sentence.
 */
const CONVERSATIONAL_AUDIO = /native-audio/;

/**
 * The model generation, from either naming shape — `gemini-2.5-flash-live` and
 * `gemini-live-2.5-flash` alike. Only a dotted generation counts, or digits
 * directly after `gemini-`; a trailing serial or date (`-001`, `-12-2025`) is
 * not a version, and reading one as 12 would rank a dated preview above
 * everything else.
 */
function liveModelVersion(m: string): number {
  const dotted = m.match(/(?:^|-)(\d+\.\d+)(?=-|$)/);
  if (dotted) return Number(dotted[1]);
  const major = m.match(/gemini-(\d+)(?=-|$)/);
  return major ? Number(major[1]) : 0;
}

/**
 * Rank a native-audio Live model: newer generation first, stable aliases over
 * dated previews. Returns 0 for everything else — a specialised family, an
 * unfamiliar shape, or a Live model in a naming scheme we have not vouched for.
 * A 0 here does not mean unusable, only "not adopted on sight": pickLiveModel
 * still takes anything on LIVE_MODEL_CANDIDATES.
 */
export function scoreLiveModel(model: string): number {
  const m = stripPrefix(model);
  if (SPECIALISED.test(m)) return 0;
  if (!CONVERSATIONAL_AUDIO.test(m)) return 0;
  const version = liveModelVersion(m);
  if (!version) return 0;
  const stable = /-latest$/.test(m) ? 2 : /preview|exp/.test(m) ? 0 : 1;
  return version * 10 + stable;
}

/** Whether an id belongs to a task-specialised family rather than a voice agent. */
export function isConversationalLiveModel(model: string): boolean {
  return !SPECIALISED.test(stripPrefix(model));
}

let modelCache: { at: number; models: string[] } | null = null;

/** Live-capable model ids visible to this key; cached 10 minutes; empty on failure. */
export async function listLiveModels(): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.models;
  const models: string[] = [];
  try {
    const pager = await liveClient().models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      // Everything bidi-capable, unfiltered: which of these is fit to hold a
      // voice session is decided in one place (scoreLiveModel), and /api/health
      // reports this list, so it has to show what the key really exposes.
      if (m.name && (m.supportedActions ?? []).includes("bidiGenerateContent")) models.push(stripPrefix(m.name));
    }
  } catch {
    /* offline or listing unsupported → caller falls back to the default candidate */
  }
  modelCache = { at: Date.now(), models };
  return models;
}

export async function resolveLiveModel(): Promise<{ model: string; warning?: string }> {
  if (!liveAvailable()) throw new LiveUnavailableError("GEMINI_API_KEY is not configured");
  const picked = pickLiveModel(await listLiveModels(), process.env.GEMINI_LIVE_MODEL);
  if (!picked.model) throw new LiveUnavailableError(picked.warning ?? "No Live model available");
  return { model: picked.model, warning: picked.warning };
}

/**
 * One-use ephemeral token with the model, prompt, tools and modalities locked
 * in — the browser cannot change them. New sessions must start within 2 minutes.
 */
export async function mintLiveToken(opts: { model: string; config: LiveConnectConfig; ttlMinutes?: number }): Promise<{ token: string; expiresAt: string }> {
  const now = Date.now();
  const expireTime = new Date(now + (opts.ttlMinutes ?? 30) * 60_000).toISOString();
  const newSessionExpireTime = new Date(now + 2 * 60_000).toISOString();
  const token = await liveClient().authTokens.create({
    config: { uses: 1, expireTime, newSessionExpireTime, liveConnectConstraints: { model: opts.model, config: opts.config } },
  });
  if (!token.name) throw new Error("Gemini returned no token name");
  return { token: token.name, expiresAt: token.expireTime ?? expireTime };
}

export function estimateLiveCost(u: Partial<LiveUsage>): number {
  const per = (n: number | undefined, price: number) => ((n ?? 0) / 1e6) * price;
  return per(u.inputTokens, LIVE_PRICES.textIn) + per(u.inputAudioTokens, LIVE_PRICES.audioIn) + per(u.outputTokens, LIVE_PRICES.textOut) + per(u.outputAudioTokens, LIVE_PRICES.audioOut);
}

/** Cost row for a whole Live session (usage is summed client-side per turn → labeled estimated). */
export async function logLiveUsage(route: "hr_live" | "oral_check", model: string, usage: Partial<LiveUsage>, latencyMs: number): Promise<void> {
  const inputTokens = (usage.inputTokens ?? 0) + (usage.inputAudioTokens ?? 0);
  const outputTokens = (usage.outputTokens ?? 0) + (usage.outputAudioTokens ?? 0);
  await db
    .insert(t.aiCallLog)
    .values({
      id: id(),
      route,
      model,
      inputTokens: Math.min(inputTokens, 2_000_000_000),
      outputTokens: Math.min(outputTokens, 2_000_000_000),
      estCost: estimateLiveCost(usage),
      latencyMs: Math.max(0, Math.min(latencyMs, 2_000_000_000)),
      promptVersion: `${LIVE_PROMPT_VERSION} (client-estimated)`,
    })
    .catch(() => {});
}

export { parseDuration } from "./shared";
