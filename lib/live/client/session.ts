import type { LiveServerMessage, Session } from "@google/genai";
import { base64ToBytes } from "./audio";
import { parseDuration, type Citation, type LiveUsage } from "../shared";

/**
 * Thin browser wrapper over the Gemini Live SDK (spec FR-14.1). The SDK is
 * imported lazily so pages only pay for it once a session actually starts.
 */

export type LiveEvent =
  | { type: "open" }
  | { type: "input"; text: string }
  | { type: "output"; text: string }
  | { type: "audio"; pcm: Uint8Array }
  | { type: "interrupted" }
  | { type: "turnComplete" }
  | { type: "goAway"; seconds: number | null }
  | { type: "resumptionHandle"; handle: string }
  | { type: "usage"; usage: Partial<LiveUsage> }
  | { type: "close"; code: number; reason: string }
  | { type: "error"; message: string }
  // client-side only (mock transport)
  | { type: "speaking"; value: boolean }
  | { type: "citations"; citations: Citation[] }
  | { type: "result"; result: Record<string, unknown> };

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type ToolHandler = (call: ToolCall) => Promise<Record<string, unknown>>;

export type LiveConnection = {
  sendAudio(base64Pcm: string): void;
  endAudio(): void;
  sendText(text: string): void;
  close(): void;
};

function usageFromMetadata(meta: NonNullable<LiveServerMessage["usageMetadata"]>): Partial<LiveUsage> {
  const split = (details: Array<{ modality?: string; tokenCount?: number }> | undefined, total: number | undefined) => {
    if (!details?.length) return { text: total ?? 0, audio: 0 };
    let text = 0;
    let audio = 0;
    for (const d of details) {
      if (d.modality === "AUDIO") audio += d.tokenCount ?? 0;
      else text += d.tokenCount ?? 0;
    }
    return { text, audio };
  };
  const input = split(meta.promptTokensDetails, meta.promptTokenCount);
  const output = split(meta.responseTokensDetails, meta.responseTokenCount);
  return { inputTokens: input.text, inputAudioTokens: input.audio, outputTokens: output.text, outputAudioTokens: output.audio };
}

export async function connectLive(opts: {
  token: string;
  model: string;
  resumeHandle?: string;
  /** Tools declared NON_BLOCKING server-side: their results are queued behind the filler phrase (WHEN_IDLE). */
  nonBlockingTools?: readonly string[];
  onEvent: (event: LiveEvent) => void;
  onToolCall: ToolHandler;
}): Promise<LiveConnection> {
  const { GoogleGenAI, FunctionResponseScheduling } = await import("@google/genai");
  const nonBlocking = new Set(opts.nonBlockingTools ?? []);
  const ai = new GoogleGenAI({ apiKey: opts.token, httpOptions: { apiVersion: "v1alpha" } });
  let session: Session | null = null;
  const cancelled = new Set<string>();

  const onmessage = (msg: LiveServerMessage) => {
    if (msg.toolCallCancellation?.ids) for (const id of msg.toolCallCancellation.ids) cancelled.add(id);
    if (msg.toolCall?.functionCalls?.length) {
      for (const fc of msg.toolCall.functionCalls) {
        const call: ToolCall = { id: fc.id ?? "", name: fc.name ?? "", args: (fc.args ?? {}) as Record<string, unknown> };
        void opts
          .onToolCall(call)
          .catch((err: unknown) => ({ error: err instanceof Error ? err.message : "tool failed" }))
          .then((response) => {
            if (cancelled.has(call.id)) return;
            session?.sendToolResponse({
              functionResponses: [
                { id: call.id, name: call.name, response, ...(nonBlocking.has(call.name) ? { scheduling: FunctionResponseScheduling.WHEN_IDLE } : {}) },
              ],
            });
          });
      }
    }
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) opts.onEvent({ type: "interrupted" });
      if (sc.inputTranscription?.text) opts.onEvent({ type: "input", text: sc.inputTranscription.text });
      if (sc.outputTranscription?.text) opts.onEvent({ type: "output", text: sc.outputTranscription.text });
      for (const part of sc.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data && (part.inlineData?.mimeType ?? "audio/pcm").startsWith("audio/pcm")) opts.onEvent({ type: "audio", pcm: base64ToBytes(data) });
      }
      if (sc.turnComplete) opts.onEvent({ type: "turnComplete" });
    }
    if (msg.goAway) opts.onEvent({ type: "goAway", seconds: parseDuration(msg.goAway.timeLeft) });
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      opts.onEvent({ type: "resumptionHandle", handle: msg.sessionResumptionUpdate.newHandle });
    }
    if (msg.usageMetadata) opts.onEvent({ type: "usage", usage: usageFromMetadata(msg.usageMetadata) });
  };

  session = await ai.live.connect({
    model: opts.model,
    config: opts.resumeHandle ? { sessionResumption: { handle: opts.resumeHandle } } : undefined,
    callbacks: {
      onopen: () => opts.onEvent({ type: "open" }),
      onmessage,
      onerror: (e: ErrorEvent) => opts.onEvent({ type: "error", message: e.message || "Connection error" }),
      onclose: (e: CloseEvent) => opts.onEvent({ type: "close", code: e.code, reason: e.reason }),
    },
  });

  return {
    sendAudio(base64Pcm) {
      session?.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: "audio/pcm;rate=16000" } });
    },
    endAudio() {
      try {
        session?.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        /* socket already gone */
      }
    },
    sendText(text) {
      session?.sendClientContent({ turns: text, turnComplete: true });
    },
    close() {
      try {
        session?.close();
      } catch {
        /* already closed */
      }
      session = null;
    },
  };
}
