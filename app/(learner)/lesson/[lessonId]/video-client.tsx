"use client";

import { Icon } from "@/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiSurface, Button, Card, Chip, Input, PillButton, Skeleton, cx } from "@/components/ui";
import { useLessonProgress } from "@/components/lesson-progress";
import { Tabs } from "@/components/tabs";
import type { TutorCitation } from "@/lib/db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Citation = TutorCitation;
type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[]; mock?: boolean };
type Chunk = { id: string; startSec: number; endSec: number; text: string };

const TRANSCRIPT_PREVIEW = 40;

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function VideoLessonClient({
  lessonId,
  youtubeId,
  videoId,
  chunks,
  initialMessages,
  initialThreadId,
  initialCompleted,
  initialPositionSec,
  initialCoverage,
  durationSec,
}: {
  lessonId: string;
  youtubeId: string;
  videoId: string;
  chunks: Chunk[];
  initialMessages: Msg[];
  initialThreadId: string | null;
  initialCompleted: boolean;
  initialPositionSec: number;
  initialCoverage: number;
  durationSec: number;
}) {
  const progress = useLessonProgress();
  const confirmRef = useRef(progress?.confirm);
  confirmRef.current = progress?.confirm;
  const [saveState, setSaveState] = useState<"saved" | "offline">("saved");
  const playerRef = useRef<any>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerColumnRef = useRef<HTMLDivElement>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState(initialCoverage);
  const [completed, setCompleted] = useState(initialCompleted);
  const [tab, setTab] = useState<"overview" | "tutor" | "transcript">("overview");
  const [visitedTutor, setVisitedTutor] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const positionRef = useRef(initialPositionSec);
  // A server progress refresh must never restart a player that is already running.
  const resumePositionRef = useRef(initialPositionSec);

  // ---- YouTube IFrame API (spec FR-5.6)
  useEffect(() => {
    let cancelled = false;
    function init() {
      if (cancelled || !playerHostRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(playerHostRef.current, {
        videoId: youtubeId,
        playerVars: { enablejsapi: 1, origin: window.location.origin, rel: 0 },
        events: {
          onReady: () => {
            if (resumePositionRef.current > 0) playerRef.current?.seekTo?.(resumePositionRef.current, true);
          },
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
          setSaveState("saved");
          if (data.completed) { setCompleted(true); if (data.outline) confirmRef.current?.(data.outline); }
        } else setSaveState("offline");
      } catch {
        setSaveState("offline");
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lessonId]);

  const seekTo = useCallback(
    (sec: number) => {
      playerRef.current?.seekTo?.(sec, true);
      playerRef.current?.playVideo?.();
      // On narrow screens the player is not sticky — bring it back into view.
      if (window.matchMedia("(max-width: 1023px)").matches) {
        playerColumnRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      }
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "citation_click", payload: { lessonId, sec } }),
      }).catch(() => {});
    },
    [lessonId],
  );

  const visibleChunks = showAll ? chunks : chunks.slice(0, TRANSCRIPT_PREVIEW);

  return (
    <div className="mb-6 space-y-5">
      {/* Player column — sticky on desktop so citations always seek a visible player */}
      <div ref={playerColumnRef} className="scroll-mt-12">
        {playerError ? (
          <Card className="flex aspect-video items-center justify-center p-6 text-center">
            <div>
              <p className="mb-1 font-medium">Video unavailable</p>
              <p className="text-sm text-muted">{playerError} Contact your training team if it remains unavailable.</p>
            </div>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-black">
            <div className="aspect-video w-full">
              <div ref={playerHostRef} className="h-full w-full" />
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          {completed ? (
            <Chip variant="success">Watched</Chip>
          ) : (
            <>
              <div className="h-1 w-meter overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={coverage} aria-valuemin={0} aria-valuemax={100} aria-label="Watch coverage">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${coverage}%` }} />
              </div>
              <span>{coverage}% watched · completes at 90%</span>
            </>
          )}
        </div>
        {saveState === "offline" ? <p role="status" className="mt-2 text-sm text-warning-fg">Progress could not be saved. Keep this page open; saving retries while the video plays.</p> : <p className="mt-2 text-sm text-muted">{resumePositionRef.current > 0 ? `Resumed from ${fmtTime(resumePositionRef.current)}. ` : ""}Progress saved while playing.</p>}

      </div>

      <div className="min-w-0">
        <Tabs
          label="Lesson panels"
          value={tab}
          onChange={(id) => { setTab(id as "overview" | "tutor" | "transcript"); if (id === "tutor") setVisitedTutor(true); }}
          tabs={[
            { id: "overview", label: "Overview", panelId: "lesson-overview" },
            { id: "transcript", label: "Transcript", panelId: "lesson-transcript" },
            { id: "tutor", panelId: "lesson-tutor", label: <span className="inline-flex items-center gap-1"><Icon name="sparkle" size={14} />Tutor</span> },
          ]}
          className="mb-3"
        />
        <section hidden={tab !== "overview"} id="lesson-overview" role="tabpanel" aria-label="Overview" className="rounded-card border border-border bg-surface p-5"><h2 className="mb-2 text-lg font-semibold">About this lesson</h2><p className="text-muted">Watch at least 90% of the video to complete this lesson. Your saved position is restored when you return. Open the transcript to jump to a topic, or ask the Tutor about the lesson.</p></section>
          <div hidden={tab !== "tutor"} id="lesson-tutor" role="tabpanel" aria-label="Tutor">{visitedTutor ? <TutorPanel
            lessonId={lessonId}
            videoId={videoId}
            initialMessages={initialMessages}
            initialThreadId={initialThreadId}
            onSeek={seekTo}
            getPosition={() => positionRef.current}
          /> : null}</div>
          <Card hidden={tab !== "transcript"} id="lesson-transcript" role="tabpanel" aria-label="Transcript" className="p-3">
            {chunks.length === 0 ? <p className="p-2 text-muted">No transcript is available for this video yet.</p> : null}
            <ol className="flex flex-col gap-1">
              {visibleChunks.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => seekTo(c.startSec)}
                    disabled={c.startSec >= durationSec}
                    className="touch-target w-full rounded-control px-2 py-2 text-start text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted"
                  >
                    <span className="bidi-isolate me-2 font-mono text-xs text-link">{fmtTime(c.startSec)}</span>
                    {c.text}
                    {c.startSec >= durationSec ? <span className="block text-sm">Timestamp is outside this video. Ask your training team to update the transcript.</span> : null}
                  </button>
                </li>
              ))}
            </ol>
            {!showAll && chunks.length > TRANSCRIPT_PREVIEW ? (
              <div className="mt-3 flex justify-center">
                <PillButton onClick={() => setShowAll(true)}>Show full transcript ({chunks.length - TRANSCRIPT_PREVIEW} more)</PillButton>
              </div>
            ) : null}
          </Card>
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
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    fetch(`/api/tutor/suggest?lessonId=${lessonId}&videoId=${videoId}&pos=${Math.round(getPosition())}`)
      .then((r) => (r.ok ? r.json() : { questions: [] }))
      .then((d) => setSuggestions(d.questions ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, videoId]);

  // Follow the stream only while the reader is already near the bottom of the page.
  useEffect(() => {
    function onScroll() {
      stickRef.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView({ block: "end", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [messages, streaming]);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || streaming !== null) return;
      stickRef.current = true;
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
              setMessages((m) => [...m, { role: "assistant", content: event.message }]);
              setStreaming(null);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((m) => [...m, { role: "assistant", content: "The Tutor is unavailable right now." }]);
        }
        setStreaming(null);
      }
    },
    [lessonId, scope, streaming],
  );

  return (
    <section aria-label="Lesson Tutor" className="flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          Lesson Tutor <Chip variant="ai">AI</Chip>
        </span>
        <PillButton onClick={() => setScope((s) => (s === "lesson" ? "course" : "lesson"))} aria-label="Toggle retrieval scope">
          {scope === "lesson" ? "This lesson" : "Whole course"} <Icon name="chevron-down" size={12} />
        </PillButton>
      </div>

      {/* Keep the sticky composer below the scope header, including at native zoom. */}
      <div className="min-w-0">
        <div className="flex flex-col gap-3" dir="auto">
          {messages.length === 0 && streaming === null ? (
            <p className="text-sm text-muted">Ask anything about this video — answers come only from the lesson content, with timestamps you can tap.</p>
          ) : null}
          {messages.map((m, i) => (
            <div key={i} className={cx(m.role === "user" ? "text-end" : "")} dir="auto">
              {m.role === "user" ? (
                <div className="inline-block max-w-[92%] rounded-card bg-surface-2 px-3 py-2 text-start text-sm">
                  <span className="whitespace-pre-wrap">{m.content}</span>
                </div>
              ) : (
                <AiSurface mock={m.mock}>
                  <span className="whitespace-pre-wrap">{m.content}</span>
                  {m.citations && m.citations.length > 0 ? (
                    <span className="mt-2 flex flex-wrap gap-2">
                      {m.citations.map((c, j) => !c.lessonId ? (
                        <span key={j} className="text-sm text-muted">Source unavailable · {fmtTime(c.startSec)}</span>
                      ) : c.lessonId !== lessonId ? (
                        <a key={j} href={`/lesson/${encodeURIComponent(c.lessonId)}?t=${c.startSec}`} title={c.quote} className="bidi-isolate touch-target inline-flex items-center gap-1 rounded-control bg-surface px-2 py-1 text-sm font-medium text-ai-fg hover:bg-accent-tint">
                          <Icon name="play" size={12} /> {c.lessonTitle} · {fmtTime(c.startSec)}
                        </a>
                      ) : (
                        <button
                          key={j}
                          onClick={() => onSeek(c.startSec)}
                          title={c.quote}
                          className="bidi-isolate pressable hit-area inline-flex items-center gap-1 rounded-control bg-surface px-2 py-1 text-xs font-medium text-ai-fg hover:bg-ai hover:text-ai-tint"
                        >
                          <Icon name="play" size={12} /> {fmtTime(c.startSec)}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </AiSurface>
              )}
            </div>
          ))}
          {streaming !== null ? (
            <div dir="auto">
              <AiSurface>
                {streaming.length === 0 ? <Skeleton className="h-4 w-[160px]" /> : <span className="whitespace-pre-wrap">{streaming}</span>}
                <span className="ms-2 text-sm text-muted" role="status">Responding…</span>
              </AiSurface>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        {suggestions.length > 0 && messages.length === 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <PillButton key={s} onClick={() => ask(s)}>
                {s}
              </PillButton>
            ))}
          </div>
        ) : null}

        <div className={cx(messages.length > 0 || streaming !== null ? "composer-sticky" : "", "z-10 mt-4 border-t border-border bg-background pt-2")}>
          <div className="mb-2 flex flex-wrap gap-2">
            <PillButton onClick={() => ask("Explain this part in simpler words.")} disabled={streaming !== null}>
              Explain simpler
            </PillButton>
            <PillButton onClick={() => ask("Quiz me on this section with 3 quick questions, then give the answers.")} disabled={streaming !== null}>
              Quiz me
            </PillButton>
            {streaming !== null ? (
              <PillButton onClick={() => abortRef.current?.abort()} className="ms-auto text-destructive-text">
                <Icon name="stop" size={12} /> Stop
              </PillButton>
            ) : null}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex gap-2 pb-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this lesson…"
              aria-label="Ask the tutor"
              dir="auto"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={streaming !== null || !input.trim()} className="px-3" aria-label="Send">
              <Icon name="arrow-up" size={18} />
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
