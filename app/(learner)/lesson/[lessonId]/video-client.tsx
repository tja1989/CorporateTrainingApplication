"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Chip, Skeleton, cx } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Citation = { startSec: number; endSec: number; quote: string };
type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[]; mock?: boolean };
type Chunk = { id: string; startSec: number; endSec: number; text: string };

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoLessonClient({
  lessonId,
  youtubeId,
  videoId,
  chunks,
  initialMessages,
  initialThreadId,
  initialCompleted,
}: {
  lessonId: string;
  youtubeId: string;
  videoId: string;
  chunks: Chunk[];
  initialMessages: Msg[];
  initialThreadId: string | null;
  initialCompleted: boolean;
}) {
  const playerRef = useRef<any>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState(0);
  const [completed, setCompleted] = useState(initialCompleted);
  const [tab, setTab] = useState<"tutor" | "transcript">("tutor");
  const positionRef = useRef(0);

  // ---- YouTube IFrame API (spec FR-5.6)
  useEffect(() => {
    let cancelled = false;
    function init() {
      if (cancelled || !playerHostRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(playerHostRef.current, {
        videoId: youtubeId,
        playerVars: { enablejsapi: 1, origin: window.location.origin, rel: 0 },
        events: {
          onError: (e: { data: number }) => {
            if (e.data === 101 || e.data === 150) setPlayerError("The video owner has disabled embedding for this video.");
            else if (e.data === 100) setPlayerError("This video is no longer available.");
            else setPlayerError("The video failed to load.");
          },
        },
      });
    }
    if (window.YT?.Player) init();
    else {
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        init();
      };
    }
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [youtubeId]);

  // ---- Heartbeat every 5s while PLAYING and visible (spec FR-5.7)
  useEffect(() => {
    if (completed) return;
    const interval = setInterval(async () => {
      const player = playerRef.current;
      if (!player?.getPlayerState) return;
      if (player.getPlayerState() !== 1 /* PLAYING */) return;
      if (document.visibilityState !== "visible") return;
      const pos = player.getCurrentTime?.() ?? 0;
      positionRef.current = pos;
      try {
        const res = await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId, positionSec: pos }),
        });
        if (res.ok) {
          const data = await res.json();
          setCoverage(data.coveragePct);
          if (data.completed) setCompleted(true);
        }
      } catch {
        /* offline heartbeats just skip */
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lessonId, completed]);

  const seekTo = useCallback((sec: number) => {
    playerRef.current?.seekTo?.(sec, true);
    playerRef.current?.playVideo?.();
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "citation_click", payload: { lessonId, sec } }),
    }).catch(() => {});
  }, [lessonId]);

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div>
        {/* Player — no overlays ever (YouTube ToS) */}
        {playerError ? (
          <Card className="flex aspect-video items-center justify-center p-6 text-center">
            <div>
              <p className="mb-1 font-medium">Video unavailable</p>
              <p className="text-sm text-muted">{playerError} Your admin has been notified by the weekly link check.</p>
            </div>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-[--radius-card] border border-border bg-black">
            <div className="aspect-video w-full">
              <div ref={playerHostRef} className="h-full w-full" />
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          {completed ? (
            <Chip variant="success">Watched ✓</Chip>
          ) : (
            <>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${coverage}%` }} />
              </div>
              <span>{coverage}% watched · completes at 90%</span>
            </>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div role="tablist" aria-label="Lesson panels" className="mb-2 flex gap-1 rounded-[--radius-control] bg-surface-2 p-1">
          {(["tutor", "transcript"] as const).map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
              className={cx(
                "flex-1 rounded-[6px] px-3 py-1.5 text-sm font-medium capitalize",
                tab === name ? "bg-surface shadow-sm" : "text-muted",
              )}
            >
              {name === "tutor" ? "✳ Tutor" : "Transcript"}
            </button>
          ))}
        </div>
        {tab === "tutor" ? (
          <TutorPanel
            lessonId={lessonId}
            videoId={videoId}
            initialMessages={initialMessages}
            initialThreadId={initialThreadId}
            onSeek={seekTo}
            getPosition={() => positionRef.current}
          />
        ) : (
          <Card className="max-h-[70vh] overflow-y-auto p-3">
            <ol className="flex flex-col gap-2">
              {chunks.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => seekTo(c.startSec)}
                    className="w-full rounded-[--radius-control] px-2 py-1.5 text-start text-sm hover:bg-surface-2"
                  >
                    <span className="bidi-isolate me-2 font-mono text-xs text-primary">{fmtTime(c.startSec)}</span>
                    {c.text.length > 220 ? c.text.slice(0, 220) + "…" : c.text}
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}

function TutorPanel({
  lessonId,
  videoId,
  initialMessages,
  initialThreadId,
  onSeek,
  getPosition,
}: {
  lessonId: string;
  videoId: string;
  initialMessages: Msg[];
  initialThreadId: string | null;
  onSeek: (sec: number) => void;
  getPosition: () => number;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [scope, setScope] = useState<"lesson" | "course">("lesson");
  const threadRef = useRef<string | null>(initialThreadId);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/tutor/suggest?videoId=${videoId}&pos=${Math.round(getPosition())}`)
      .then((r) => (r.ok ? r.json() : { questions: [] }))
      .then((d) => setSuggestions(d.questions ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || streaming !== null) return;
      setMessages((m) => [...m, { role: "user", content: question.trim() }]);
      setInput("");
      setStreaming("");
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId, message: question.trim(), scope, threadId: threadRef.current }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error("Tutor unavailable");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let answer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const raw of events) {
            const line = raw.trim();
            if (!line.startsWith("data: ")) continue;
            const event = JSON.parse(line.slice(6));
            if (event.type === "thread") threadRef.current = event.threadId;
            else if (event.type === "delta") {
              answer += event.text;
              setStreaming(answer);
            } else if (event.type === "final") {
              setMessages((m) => [...m, { role: "assistant", content: event.answer, citations: event.citations, mock: event.mock }]);
              setStreaming(null);
            } else if (event.type === "error") {
              setMessages((m) => [...m, { role: "assistant", content: `⚠ ${event.message}` }]);
              setStreaming(null);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((m) => [...m, { role: "assistant", content: "⚠ The Tutor is unavailable right now." }]);
        }
        setStreaming(null);
      }
    },
    [lessonId, scope, streaming],
  );

  return (
    <Card className="flex h-[70vh] flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-ai-voice text-sm font-semibold text-ai-fg">Lesson Tutor</span>
        <button
          onClick={() => setScope((s) => (s === "lesson" ? "course" : "lesson"))}
          className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:bg-surface-2"
          aria-label="Toggle retrieval scope"
        >
          {scope === "lesson" ? "This lesson ▾" : "Whole course ▾"}
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3" dir="auto">
        {messages.length === 0 && streaming === null ? (
          <p className="p-2 text-sm text-muted">
            Ask anything about this video — answers come only from the lesson content, with timestamps you can tap.
          </p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={cx("mb-3", m.role === "user" ? "text-end" : "")} dir="auto">
            <div
              className={cx(
                "inline-block max-w-[92%] rounded-[--radius-card] px-3 py-2 text-sm",
                m.role === "user" ? "bg-surface-2 text-start" : "font-ai-voice bg-ai-tint text-start",
              )}
            >
              <span className="whitespace-pre-wrap">{m.content}</span>
              {m.citations && m.citations.length > 0 ? (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.citations.map((c, j) => (
                    <button
                      key={j}
                      onClick={() => onSeek(c.startSec)}
                      title={c.quote}
                      className="bidi-isolate pressable rounded-full bg-surface px-2 py-0.5 font-sans text-xs font-medium text-ai-fg hover:opacity-80"
                    >
                      ▶ {fmtTime(c.startSec)}
                    </button>
                  ))}
                </span>
              ) : null}
              {m.mock ? <span className="mt-1 block font-sans text-[10px] text-muted">offline demo mode</span> : null}
            </div>
          </div>
        ))}
        {streaming !== null ? (
          <div className="mb-3" dir="auto">
            <div className="font-ai-voice inline-block max-w-[92%] rounded-[--radius-card] bg-ai-tint px-3 py-2 text-sm">
              {streaming.length === 0 ? (
                <Skeleton className="h-4 w-40" />
              ) : (
                <span className="whitespace-pre-wrap">{streaming}</span>
              )}
              <span className="stream-cursor ms-0.5" aria-hidden />
            </div>
          </div>
        ) : null}
      </div>

      {suggestions.length > 0 && messages.length === 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="pressable rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="border-t border-border p-2">
        <div className="mb-1.5 flex gap-1.5">
          <button
            onClick={() => ask("Explain this part in simpler words.")}
            className="pressable rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
            disabled={streaming !== null}
          >
            Explain simpler
          </button>
          <button
            onClick={() => ask("Quiz me on this section with 3 quick questions, then give the answers.")}
            className="pressable rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
            disabled={streaming !== null}
          >
            Quiz me
          </button>
          {streaming !== null ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="pressable ms-auto rounded-full border border-border px-2.5 py-1 text-xs text-destructive-text"
            >
              ■ Stop
            </button>
          ) : null}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this lesson…"
            aria-label="Ask the tutor"
            dir="auto"
            className="min-w-0 flex-1 rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={streaming !== null || !input.trim()} className="px-3 py-2">
            ↑
          </Button>
        </form>
      </div>
    </Card>
  );
}
