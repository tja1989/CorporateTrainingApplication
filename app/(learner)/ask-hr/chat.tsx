"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Chip, Skeleton, cx } from "@/components/ui";

type Citation = { docId: string; title: string; sectionPath: string; version: number; effectiveDate: string };
type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[]; mock?: boolean };

const SEED_QUESTIONS = [
  "How many days of annual leave do I get?",
  "How does sick leave pay work?",
  "When is my salary paid each month?",
  "How is end-of-service pay calculated?",
];

export function HrChat({ sharedDevice }: { sharedDevice: boolean }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [locked, setLocked] = useState(sharedDevice);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [escalateOffer, setEscalateOffer] = useState(false);
  const [ticketSent, setTicketSent] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (locked) return;
    fetch("/api/hr")
      .then((r) => r.json())
      .then((d) => {
        conversationRef.current = d.conversationId;
        setMessages(d.messages ?? []);
      })
      .catch(() => setMessages([]));
  }, [locked]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || streaming !== null) return;
      setMessages((m) => [...(m ?? []), { role: "user", content: question.trim() }]);
      setInput("");
      setStreaming("");
      setEscalateOffer(false);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/hr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question.trim(), conversationId: conversationRef.current }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error();
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
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
            if (event.type === "conversation") conversationRef.current = event.conversationId;
            else if (event.type === "delta") setStreaming((s) => (s ?? "") + event.text);
            else if (event.type === "final") {
              setMessages((m) => [...(m ?? []), { role: "assistant", content: event.answer, citations: event.citations, mock: event.mock }]);
              setStreaming(null);
              if (event.escalationSuggested) setEscalateOffer(true);
            } else if (event.type === "error") {
              setMessages((m) => [...(m ?? []), { role: "assistant", content: "⚠ The assistant is unavailable right now — you can still reach HR with “Talk to a person”." }]);
              setStreaming(null);
              setEscalateOffer(true);
            }
          }
        }
      } catch {
        setStreaming(null);
      }
    },
    [streaming],
  );

  const escalate = useCallback(async () => {
    if (!conversationRef.current) return;
    const confirmed = window.confirm(
      "Your name and this conversation will be shared with the HR team so they can help you directly. Continue?",
    );
    if (!confirmed) return;
    const res = await fetch("/api/hr/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversationRef.current }),
    });
    if (res.ok) {
      const d = await res.json();
      setTicketSent(d.ticketId);
      setEscalateOffer(false);
    }
  }, []);

  if (locked) {
    return (
      <Card className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-2xl" aria-hidden>✳</p>
        <h1 className="font-medium">Your HR conversations are private</h1>
        <p className="max-w-sm text-sm text-muted">You signed in on a shared device, so history stays hidden until you confirm it&#39;s you.</p>
        <Button onClick={() => setLocked(false)}>Show my conversation</Button>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-ai-voice text-sm font-semibold text-ai-fg">HR Assistant</span>
        <button onClick={escalate} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2">
          Talk to a person
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3" dir="auto">
        {messages === null ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : null}
        {messages !== null && messages.length === 0 ? (
          <div className="p-2 text-sm text-muted">
            <p className="mb-1">
              👋 I&#39;m an <strong>AI assistant</strong> that answers questions about company HR policies, with the exact
              policy text cited. I don&#39;t make decisions — HR does.
            </p>
            <p>Ask me anything about leave, pay, hours, or end-of-service.</p>
          </div>
        ) : null}
        {(messages ?? []).map((m, i) => (
          <div key={i} className={cx("mb-3", m.role === "user" ? "text-end" : "")} dir="auto">
            <div
              className={cx(
                "inline-block max-w-[92%] rounded-[--radius-card] px-3 py-2 text-sm",
                m.role === "user" ? "bg-surface-2 text-start" : "font-ai-voice bg-ai-tint text-start",
              )}
            >
              <span className="whitespace-pre-wrap">{renderLite(m.content)}</span>
              {m.citations && m.citations.length > 0 ? (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.citations.map((c, j) => (
                    <a
                      key={j}
                      href={`/policy/${c.docId}?section=${encodeURIComponent(c.sectionPath)}`}
                      onClick={() => fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "hr_citation_click", payload: { docId: c.docId } }) }).catch(() => {})}
                      title={`${c.title} — v${c.version}, effective ${c.effectiveDate}`}
                      className="bidi-isolate pressable rounded-full bg-surface px-2 py-0.5 font-sans text-xs font-medium text-ai-fg hover:opacity-80"
                    >
                      § {c.title} · {c.sectionPath.length > 24 ? c.sectionPath.slice(0, 24) + "…" : c.sectionPath}
                    </a>
                  ))}
                </span>
              ) : null}
              {m.mock ? <span className="mt-1 block font-sans text-[10px] text-muted">offline demo mode</span> : null}
            </div>
            {m.role === "assistant" && i === (messages ?? []).length - 1 && streaming === null ? (
              <div className="mt-1 flex gap-1">
                {(["up", "down"] as const).map((fb) => (
                  <button
                    key={fb}
                    aria-label={fb === "up" ? "Helpful" : "Not helpful"}
                    onClick={() =>
                      fetch("/api/hr/feedback", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ conversationId: conversationRef.current, feedback: fb }),
                      }).catch(() => {})
                    }
                    className="rounded px-1.5 text-xs text-muted hover:bg-surface-2"
                  >
                    {fb === "up" ? "👍" : "👎"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {streaming !== null ? (
          <div className="mb-3" dir="auto">
            <div className="font-ai-voice inline-block max-w-[92%] rounded-[--radius-card] bg-ai-tint px-3 py-2 text-sm">
              {streaming.length === 0 ? <Skeleton className="h-4 w-40" /> : <span className="whitespace-pre-wrap">{renderLite(streaming)}</span>}
              <span className="stream-cursor ms-0.5" aria-hidden />
            </div>
          </div>
        ) : null}
        {ticketSent ? (
          <Chip variant="success">Ticket sent to HR — they&#39;ll reply here and you&#39;ll get a notification.</Chip>
        ) : null}
        {escalateOffer && !ticketSent ? (
          <button onClick={escalate} className="pressable rounded-[--radius-control] border border-border px-3 py-2 text-sm text-primary hover:bg-surface-2">
            → Ask the HR team directly
          </button>
        ) : null}
      </div>

      {messages !== null && messages.length === 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {SEED_QUESTIONS.map((q) => (
            <button key={q} onClick={() => ask(q)} className="pressable rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2">
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-border p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about any HR policy — any language"
          aria-label="Ask the HR assistant"
          dir="auto"
          className="min-w-0 flex-1 rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={streaming !== null || !input.trim()} className="px-3 py-2">↑</Button>
      </form>
    </Card>
  );
}

/** Minimal inline markdown (bold + italics) for chat bubbles. */
function renderLite(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={i} className="text-muted">{part.slice(1, -1)}</em>;
    return part;
  });
}
