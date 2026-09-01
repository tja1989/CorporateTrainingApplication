import Anthropic from "@anthropic-ai/sdk";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";

/**
 * Single AI gateway (spec §9.3): all model calls flow through here so telemetry,
 * PII redaction, and cost controls live in one place. Absent ANTHROPIC_API_KEY
 * the platform runs in deterministic mock mode — clearly labeled in the UI.
 */

export const MODEL = process.env.AI_MODEL ?? "claude-opus-5";
export const PROMPT_VERSION = "v1";

// Opus 5 pricing ($/MTok) for cost telemetry; adjust per model at deploy time.
const INPUT_PER_M = 5.0;
const OUTPUT_PER_M = 25.0;

let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** PII minimization before any provider call (spec FR-13.2). */
export function redactPii(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const rules: Array<[RegExp, string]> = [
    [/\b784-?\d{4}-?\d{7}-?\d\b/g, "[EMIRATES-ID]"], // Emirates ID
    [/\b[A-Z]{1,2}\d{6,9}\b/g, "[PASSPORT]"],
    [/\+?\d[\d\s-]{8,14}\d/g, "[PHONE]"],
    [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[EMAIL]"],
    [/\b(?:AED|aed|Dhs?\.?)\s?\d[\d,]*(?:\.\d+)?\b/g, "[AMOUNT]"],
  ];
  let out = text;
  for (const [re, repl] of rules) {
    if (re.test(out)) {
      redacted = true;
      out = out.replace(re, repl);
    }
  }
  return { text: out, redacted };
}

export async function logCall(route: string, usage: { input_tokens?: number; output_tokens?: number }, latencyMs: number) {
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  await db
    .insert(t.aiCallLog)
    .values({
      id: id(),
      route,
      model: aiAvailable() ? MODEL : "mock",
      inputTokens: inTok,
      outputTokens: outTok,
      estCost: (inTok / 1_000_000) * INPUT_PER_M + (outTok / 1_000_000) * OUTPUT_PER_M,
      latencyMs: Math.round(latencyMs),
      promptVersion: PROMPT_VERSION,
    })
    .catch(() => {});
}

export type Effort = "low" | "medium" | "high";

/** Non-streaming structured call: returns parsed JSON matching the given shape. */
export async function structuredCall<T>(opts: {
  route: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: Effort;
  maxTokens?: number;
}): Promise<T> {
  const started = Date.now();
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }],
    output_config: {
      effort: opts.effort ?? "high",
      format: {
        type: "json_schema" as const,
        name: opts.schemaName,
        schema: opts.schema,
      },
    },
    messages: [{ role: "user", content: opts.user }],
  } as Parameters<typeof anthropic.messages.create>[0]);
  const message = response as Anthropic.Message;
  await logCall(opts.route, message.usage ?? {}, Date.now() - started);
  if (message.stop_reason === "refusal") throw new AiRefusalError();
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No structured content returned");
  return JSON.parse(textBlock.text) as T;
}

export class AiRefusalError extends Error {
  constructor() {
    super("The AI declined this request.");
  }
}
