"use client";

import type { CourseOutlineView } from "@/lib/lms/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { createMicCapture, createPlayer, micSupported, type MicCapture, type Player } from "./audio";
import { connectLive, type LiveConnection, type LiveEvent, type ToolCall } from "./session";
import { microphoneRequest } from "./microphone-request";
import { createMockTransport } from "./mock-transport";
import { KICKOFF_TEXT, NON_BLOCKING_TOOLS, citationKey, type Citation, type Evaluation as LiveEvaluation, type LiveKind, type LiveUsage, type SessionInfo, type Turn } from "../shared";

/**
 * One hook drives both voice screens (spec FR-14): consent → mic → token →
 * live session → persisted transcript → end. Start order matters: the mic
 * prompt comes before the one-use token is minted for configured voice. Offline
 * mode skips capture, and an unanswered prompt can be skipped for typing. Everything runs from
 * the click handler so browsers allow audio playback.
 */

export type VoiceStatus = "idle" | "mic" | "connecting" | "reconnecting" | "live" | "ending" | "ended" | "error";

export type VoiceResult = {
  outline?: CourseOutlineView;
  scorePct: number | null;
  outcome: string | null;
  evaluation: LiveEvaluation | null;
  evaluationSource: string | null;
  state: string | null;
};

export type VoiceState = {
  status: VoiceStatus;
  speaking: boolean;
  muted: boolean;
  typedOnly: boolean;
  level: number;
  elapsedSec: number;
  expiresAt: string | null;
  model: string | null;
  mock: boolean;
  warning: string | null;
  error: string | null;
  closeInfo: { code: number; reason: string } | null;
  turns: Turn[];
  citations: Citation[];
  pendingEscalation: boolean;
  ticketId: string | null;
  result: VoiceResult | null;
};

const INITIAL: VoiceState = {
  status: "idle",
  speaking: false,
  muted: false,
  typedOnly: false,
  level: 0,
  elapsedSec: 0,
  expiresAt: null,
  model: null,
  mock: false,
  warning: null,
  error: null,
  closeInfo: null,
  turns: [],
  citations: [],
  pendingEscalation: false,
  ticketId: null,
  result: null,
};

const EMPTY_USAGE: LiveUsage = { inputTokens: 0, outputTokens: 0, inputAudioTokens: 0, outputAudioTokens: 0 };
const PERSIST_DEBOUNCE_MS = 2000;
const HARD_STOP_GRACE_SEC = 60;
const MAX_RECONNECTS = 2;

let seq = 0;
const nextId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

function normalizeResult(res: Record<string, unknown>): VoiceResult {
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    scorePct: num(res.pct) ?? num(res.scorePct),
    outcome: str(res.outcome),
    evaluation: (res.evaluation as LiveEvaluation | undefined) ?? null,
    evaluationSource: str(res.evaluationSource) ?? (res.evaluation ? "mock" : null),
    state: str(res.state),
    outline: res.outline as CourseOutlineView | undefined,
  };
}

export function useLiveVoice(opts: { configured: boolean; kind: LiveKind; sessionUrl: string; eventUrl: string; sessionBody?: Record<string, unknown>; maxMinutes?: number }) {
  const [state, setState] = useState<VoiceState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const update = useCallback((patch: Partial<VoiceState> | ((s: VoiceState) => Partial<VoiceState>)) => {
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  }, []);

  const connRef = useRef<LiveConnection | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<Player | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const idRef = useRef<string | null>(null);
  const partialRef = useRef<{ user: string | null; assistant: string | null }>({ user: null, assistant: null });
  const pendingTurnsRef = useRef<Turn[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usageRef = useRef<LiveUsage>({ ...EMPTY_USAGE });
  const startedAtRef = useRef<number>(0);
  const resumeHandleRef = useRef<string | null>(null);
  const reconnectsRef = useRef(0);
  const reconnectingRef = useRef(false);
  const lastCitationsRef = useRef<Citation[]>([]);
  const hardStopSentRef = useRef(false);
  const endPostedRef = useRef(false);
  const levelTsRef = useRef(0);
  const startVersionRef = useRef(0);
  const pendingMicRef = useRef<{ skip(): void } | null>(null);

  const idKey = opts.kind === "hr" ? "conversationId" : "interviewId";

  const postEvent = useCallback(
    async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const res = await fetch(opts.eventUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, [idKey]: idRef.current }),
      });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Request failed (${res.status})`);
      return (await res.json()) as Record<string, unknown>;
    },
    [opts.eventUrl, idKey],
  );

  // ---- transcript assembly -------------------------------------------------

  const flushTurns = useCallback(async () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const batch = pendingTurnsRef.current.splice(0);
    if (batch.length === 0 || !idRef.current) return;
    await postEvent({
      type: "turn",
      turns: batch.map((x) => ({ role: x.role, text: x.text, at: x.at, citations: x.citations, mock: x.mock })),
    }).catch(() => {
      /* transcript persistence is best-effort; the session continues */
    });
  }, [postEvent]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => void flushTurns(), PERSIST_DEBOUNCE_MS);
  }, [flushTurns]);

  const finalize = useCallback(
    (role: "user" | "assistant") => {
      const partialId = partialRef.current[role];
      if (!partialId) return;
      partialRef.current[role] = null;
      const citations = role === "assistant" ? lastCitationsRef.current : undefined;
      if (role === "assistant") lastCitationsRef.current = [];
      setState((s) => {
        const turns = s.turns.map((x) => (x.id === partialId ? { ...x, final: true, citations: citations?.length ? citations : x.citations } : x));
        const done = turns.find((x) => x.id === partialId);
        if (done && done.text.trim()) pendingTurnsRef.current.push(done);
        return { ...s, turns: turns.filter((x) => x.text.trim().length > 0 || !x.final) };
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const appendPartial = useCallback(
    (role: "user" | "assistant", delta: string) => {
      const other = role === "user" ? "assistant" : "user";
      if (partialRef.current[other]) finalize(other);
      let id = partialRef.current[role];
      if (!id) {
        id = nextId();
        partialRef.current[role] = id;
        const mock = sessionRef.current?.mock && role === "assistant" ? true : undefined;
        setState((s) => ({ ...s, turns: [...s.turns, { id: id!, role, text: delta, final: false, at: new Date().toISOString(), mock }] }));
      } else {
        setState((s) => ({ ...s, turns: s.turns.map((x) => (x.id === id ? { ...x, text: x.text + delta } : x)) }));
      }
    },
    [finalize],
  );

  const addFinalTurn = useCallback(
    (role: "user" | "assistant", text: string) => {
      const turn: Turn = { id: nextId(), role, text, final: true, at: new Date().toISOString() };
      setState((s) => ({ ...s, turns: [...s.turns, turn] }));
      pendingTurnsRef.current.push(turn);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  // ---- teardown + end ------------------------------------------------------

  const teardown = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    connRef.current?.endAudio();
    connRef.current?.close();
    connRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
  }, []);

  const postEnd = useCallback(async () => {
    if (endPostedRef.current || !idRef.current) return;
    endPostedRef.current = true;
    finalize("assistant");
    finalize("user");
    await flushTurns();
    try {
      const res = await postEvent({
        type: "end",
        model: sessionRef.current?.model,
        usage: usageRef.current,
        durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
      });
      if (opts.kind === "interview") update((s) => ({ result: { ...normalizeResult(res), ...(s.result?.evaluation ? {} : {}) } }));
    } catch {
      update({ warning: "The session ended, but saving could not be confirmed. Return to the lesson or text chat to check the saved record." });
    }
  }, [finalize, flushTurns, postEvent, opts.kind, update]);

  const stop = useCallback(async () => {
    const st = stateRef.current.status;
    if (st === "idle" || st === "ended" || st === "ending" || st === "error") return;
    startVersionRef.current += 1;
    pendingMicRef.current?.skip();
    pendingMicRef.current = null;
    update({ status: "ending", speaking: false, level: 0 });
    teardown();
    await postEnd();
    update({ status: "ended" });
  }, [teardown, postEnd, update]);

  // ---- session creation ----------------------------------------------------

  const createSession = useCallback(
    async (resume?: { handle: string }): Promise<SessionInfo> => {
      const body: Record<string, unknown> = { ...(opts.sessionBody ?? {}) };
      if (resume && idRef.current) {
        body[idKey] = idRef.current;
        body.resumeHandle = resume.handle;
      }
      const res = await fetch(opts.sessionUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as SessionInfo & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Could not start (${res.status})`);
      return json;
    },
    [opts.sessionUrl, opts.sessionBody, idKey],
  );

  const onToolCall = useCallback(
    async (call: ToolCall): Promise<Record<string, unknown>> => {
      const res = await postEvent({ type: "tool", name: call.name, args: call.args });
      if ((call.name === "search_hr_policy" || call.name === "search_course_content") && Array.isArray(res.citations)) {
        const cites = res.citations as Citation[];
        lastCitationsRef.current = cites;
        update((s) => {
          const seen = new Set(s.citations.map(citationKey));
          return { citations: [...s.citations, ...cites.filter((c) => !seen.has(citationKey(c)))] };
        });
      }
      if (call.name === "escalate_to_hr") update({ pendingEscalation: true });
      if (call.name === "submit_evaluation") {
        const r = res.response as Record<string, unknown> | undefined;
        if (r?.recorded) update({ result: { scorePct: typeof r.score_pct === "number" ? r.score_pct : null, outcome: typeof r.outcome === "string" ? r.outcome : null, evaluation: null, evaluationSource: "model", state: "COMPLETED" } });
      }
      return (res.response as Record<string, unknown> | undefined) ?? { ok: true };
    },
    [postEvent, update],
  );

  const handleEventRef = useRef<(e: LiveEvent) => void>(() => {});
  const connect = useCallback(
    async (token: string, model: string, resumeHandle?: string) => {
      const version = startVersionRef.current;
      try {
        const conn = await connectLive({
          token,
          model,
          resumeHandle,
          nonBlockingTools: opts.kind === "hr" ? NON_BLOCKING_TOOLS : [],
          onEvent: (e) => { if (version === startVersionRef.current) handleEventRef.current(e); },
          onToolCall,
        });
        if (version !== startVersionRef.current) { conn.close(); return; }
        connRef.current = conn;
        update({ status: "live", warning: resumeHandle ? null : stateRef.current.warning });
        if (!resumeHandle) conn.sendText(KICKOFF_TEXT);
      } catch (err) {
        if (version !== startVersionRef.current) return;
        teardown();
        update({ status: "error", error: err instanceof Error ? err.message : "Could not connect to Gemini Live" });
      }
    },
    [onToolCall, teardown, update, opts.kind],
  );

  const reconnect = useCallback(async () => {
    if (reconnectingRef.current || !resumeHandleRef.current || reconnectsRef.current >= MAX_RECONNECTS) return;
    const version = startVersionRef.current;
    reconnectingRef.current = true;
    reconnectsRef.current += 1;
    update({ status: "reconnecting", warning: "Connection interrupted. Reconnecting to your session…" });
    try {
      connRef.current?.close();
      connRef.current = null;
      const info = await createSession({ handle: resumeHandleRef.current });
      if (version !== startVersionRef.current) return;
      if (!info.token) throw new Error("No token on resume");
      sessionRef.current = { ...sessionRef.current, ...info };
      update({ expiresAt: info.expiresAt ?? null });
      await connect(info.token, info.model, resumeHandleRef.current);
    } catch (err) {
      if (version !== startVersionRef.current) return;
      teardown();
      update({ status: "error", error: err instanceof Error ? err.message : "Reconnect failed" });
      void postEnd();
    } finally {
      reconnectingRef.current = false;
    }
  }, [createSession, connect, teardown, update, postEnd]);

  handleEventRef.current = (e: LiveEvent) => {
    switch (e.type) {
      case "open":
        break;
      case "input":
        appendPartial("user", e.text);
        break;
      case "output":
        appendPartial("assistant", e.text);
        break;
      case "audio":
        playerRef.current?.enqueue(e.pcm);
        if (!stateRef.current.speaking) update({ speaking: true });
        break;
      case "interrupted":
        playerRef.current?.flush();
        finalize("assistant");
        update({ speaking: false });
        break;
      case "turnComplete":
        finalize("assistant");
        finalize("user");
        break;
      case "goAway":
        if (resumeHandleRef.current) void reconnect();
        else update({ warning: `The connection will close in ${e.seconds ?? "a few"} seconds.` });
        break;
      case "resumptionHandle":
        resumeHandleRef.current = e.handle;
        break;
      case "usage": {
        const u = usageRef.current;
        u.inputTokens += e.usage.inputTokens ?? 0;
        u.outputTokens += e.usage.outputTokens ?? 0;
        u.inputAudioTokens += e.usage.inputAudioTokens ?? 0;
        u.outputAudioTokens += e.usage.outputAudioTokens ?? 0;
        break;
      }
      case "close": {
        const st = stateRef.current.status;
        if (st === "ending" || st === "ended" || st === "error") break;
        if (!sessionRef.current?.mock && resumeHandleRef.current && reconnectsRef.current < MAX_RECONNECTS && e.code !== 1000) {
          void reconnect();
          break;
        }
        update({ closeInfo: { code: e.code, reason: e.reason }, status: "ending", speaking: false });
        teardown();
        void postEnd().then(() => update({ status: "ended" }));
        break;
      }
      case "error":
        update({ error: e.message });
        break;
      case "speaking":
        update({ speaking: e.value });
        break;
      case "citations": {
        lastCitationsRef.current = e.citations;
        update((s) => {
          const seen = new Set(s.citations.map(citationKey));
          return { citations: [...s.citations, ...e.citations.filter((c) => !seen.has(citationKey(c)))] };
        });
        break;
      }
      case "result":
        update({ result: normalizeResult(e.result) });
        break;
    }
  };

  const start = useCallback(async (preferTyping = false) => {
    const st = stateRef.current.status;
    if (st !== "idle" && st !== "ended" && st !== "error") return;
    const version = ++startVersionRef.current;
    // reset
    partialRef.current = { user: null, assistant: null };
    pendingTurnsRef.current = [];
    usageRef.current = { ...EMPTY_USAGE };
    resumeHandleRef.current = null;
    reconnectsRef.current = 0;
    lastCitationsRef.current = [];
    hardStopSentRef.current = false;
    endPostedRef.current = false;
    idRef.current = null;
    sessionRef.current = null;
    setState({ ...INITIAL, status: opts.configured && !preferTyping ? "mic" : "connecting" });

    // Playback context is created inside the click handler so iOS allows sound later.
    playerRef.current?.close();
    const player = createPlayer();
    playerRef.current = player;
    void player.unlock();
    player.onIdle = () => update({ speaking: false });

    let typedOnly = !opts.configured || preferTyping;
    let warning: string | null = null;
    if (!typedOnly && micSupported()) {
      const pending = microphoneRequest(() => createMicCapture({
        onChunk: (b64) => connRef.current?.sendAudio(b64),
        onLevel: (rms) => {
          const now = Date.now();
          if (now - levelTsRef.current > 80) {
            levelTsRef.current = now;
            update({ level: Math.min(1, rms * 6) });
          }
        },
      }));
      pendingMicRef.current = pending;
      const mic = await pending.result;
      if (pendingMicRef.current === pending) pendingMicRef.current = null;
      if (version !== startVersionRef.current) { mic?.stop(); return; }
      micRef.current = mic;
      if (!mic) {
        typedOnly = true;
        warning = "Microphone unavailable or skipped — you can type your answers instead.";
      }
    } else if (!typedOnly) {
      typedOnly = true;
      warning = "This browser can't capture audio here (needs HTTPS and a microphone) — typing works.";
    }
    update({ status: "connecting", typedOnly, warning });

    let info: SessionInfo;
    try {
      info = await createSession();
    } catch (err) {
      if (version !== startVersionRef.current) return;
      teardown();
      update({ status: "error", error: err instanceof Error ? err.message : "Could not start the session" });
      return;
    }
    if (version !== startVersionRef.current) {
      const endedId = info.conversationId ?? info.interviewId;
      if (endedId) void fetch(opts.eventUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "end", [idKey]: endedId }) }).catch(() => {});
      return;
    }
    sessionRef.current = info;
    idRef.current = info.conversationId ?? info.interviewId ?? null;
    startedAtRef.current = Date.now();
    update({ model: info.model, mock: info.mock, expiresAt: info.expiresAt ?? null, warning: info.warning ?? warning });

    if (info.mock) {
      micRef.current?.stop();
      micRef.current = null;
      const transport = createMockTransport({ kind: opts.kind, questions: info.questions, postEvent, onEvent: (e) => handleEventRef.current(e) });
      connRef.current = transport;
      update({ status: "live", typedOnly: true, level: 0 });
      transport.start();
      return;
    }
    if (!info.token) {
      teardown();
      update({ status: "error", error: "The server returned no session token." });
      return;
    }
    await connect(info.token, info.model);
  }, [createSession, connect, teardown, update, postEvent, opts.kind, opts.configured, opts.eventUrl, idKey]);

  const continueTyping = useCallback(() => {
    pendingMicRef.current?.skip();
    update({ typedOnly: true });
  }, [update]);

  const sendText = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || stateRef.current.status !== "live") return;
      if (!sessionRef.current?.mock) addFinalTurn("user", clean);
      connRef.current?.sendText(clean);
    },
    [addFinalTurn],
  );

  const toggleMute = useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    if (mic.muted) {
      mic.unmute();
      update({ muted: false });
    } else {
      mic.mute();
      connRef.current?.endAudio();
      update({ muted: true, level: 0 });
    }
  }, [update]);

  const escalate = useCallback(
    async (subject?: string) => {
      await flushTurns();
      const res = await postEvent({ type: "escalate", subject });
      update({ ticketId: typeof res.ticketId === "string" ? res.ticketId : null, pendingEscalation: false });
      return typeof res.ticketId === "string" ? res.ticketId : null;
    },
    [postEvent, update, flushTurns],
  );

  const previewEscalation = useCallback(async () => {
    await flushTurns();
    const response = await fetch(`/api/hr/escalate?conversationId=${encodeURIComponent(idRef.current ?? "")}`);
    if (!response.ok) throw new Error("Preview unavailable");
    return response.json();
  }, [flushTurns]);

  const dismissEscalation = useCallback(() => update({ pendingEscalation: false }), [update]);

  const testSpeaker = useCallback(() => {
    if (!playerRef.current) playerRef.current = createPlayer();
    void playerRef.current.unlock();
    playerRef.current.testTone();
  }, []);

  // ---- timers: elapsed + interview hard stop ---------------------------------
  useEffect(() => {
    if (state.status !== "live") return;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      update({ elapsedSec: elapsed });
      const limit = (opts.maxMinutes ?? 0) * 60;
      if (opts.kind === "interview" && limit > 0 && !sessionRef.current?.mock && elapsed > limit + HARD_STOP_GRACE_SEC && !hardStopSentRef.current) {
        hardStopSentRef.current = true;
        connRef.current?.sendText("Time is up — please thank the learner and call submit_evaluation now.");
        setTimeout(() => void stop(), 20_000);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [state.status, opts.kind, opts.maxMinutes, update, stop]);

  // ---- leaving the page: end the session with a beacon ----------------------
  useEffect(() => {
    const onHide = () => {
      const st = stateRef.current.status;
      if ((st === "live" || st === "connecting" || st === "reconnecting") && idRef.current && !endPostedRef.current) {
        endPostedRef.current = true;
        try {
          navigator.sendBeacon(
            opts.eventUrl,
            JSON.stringify({ type: "end", [idKey]: idRef.current, model: sessionRef.current?.model, usage: usageRef.current, durationMs: Date.now() - startedAtRef.current }),
          );
        } catch {
          /* best effort */
        }
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
      startVersionRef.current += 1;
      pendingMicRef.current?.skip();
      teardown();
    };
  }, [opts.eventUrl, idKey, teardown]);

  return { ...state, start, stop, continueTyping, sendText, toggleMute, escalate, previewEscalation, dismissEscalation, testSpeaker };
}
