"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiSurface, Button, Card, Chip, Input, PillButton, Skeleton, cx } from "@/components/ui";
import { ConfirmDialog } from "@/components/dialog";

type Citation = { docId: string; title: string; sectionPath: string; version: number; effectiveDate: string };
type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[]; mock?: boolean };

const SEED_QUESTIONS = [
  "How many days of annual leave do I get?",
  "How does sick leave pay work?",
  "When is my salary paid each month?",
  "How is end-of-service pay calculated?",
];

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HrChat({ sharedDevice }: { sharedDevice: boolean }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [locked, setLocked] = useState(sharedDevice);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [escalateOffer, setEscalateOffer] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ticketSent, setTicketSent] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
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
    setConfirmOpen(false);
    if (!conversationRef.current) return;
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
      <Card className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-xl text-muted" aria-hidden>✳</p>
        <h1 className="font-medium">Your HR conversations are private</h1>
        <p className="max-w-sm text-sm text-muted">You signed in on a shared device, so history stays hidden until you confirm it&#39;s you.</p>
        <Button onClick={() => setLocked(false)}>Show my conversation</Button>
      </Card>
    );
  }

  return (
    <section aria-label="HR Assistant" className="flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          HR Assistant <Chip variant="ai">AI</Chip>
        </span>
        <PillButton onClick={() => setConfirmOpen(true)} disabled={!conversationRef.current}>
          Talk to a person
        </PillButton>
      </div>

      <div className="flex flex-col gap-3" dir="auto">
        {messages === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton delayed className="h-4 w-2/3" />
            <Skeleton delayed className="h-4 w-1/2" />
          </div>
        ) : null}
        {messages !== null && messages.length === 0 ? (
          <div className="text-sm text-muted">
            <p className="mb-1">
              👋 I&#39;m an <strong>AI assistant</strong> that answers questions about company HR policies, with the exact
              policy text cited. I don&#39;t make decisions — HR does.
            </p>
            <p>Ask me anything about leave, pay, hours, or end-of-service.</p>
          </div>
        ) : null}
        {(messages ?? []).map((m, i) => (
          <div key={i} className={cx(m.role === "user" ? "text-end" : "")} dir="auto">
            {m.role === "user" ? (
              <div className="inline-block max-w-[92%] rounded-card bg-surface-2 px-3 py-2 text-start text-sm">
                <span className="whitespace-pre-wrap">{renderLite(m.content)}</span>
              </div>
            ) : (
              <AiSurface mock={m.mock}>
                <span className="whitespace-pre-wrap">{renderLite(m.content)}</span>
                {m.citations && m.citations.length > 0 ? (
                  <span className="mt-2 flex flex-wrap gap-2">
                    {m.citations.map((c, j) => (
                      <a
                        key={j}
                        href={`/policy/${c.docId}?section=${encodeURIComponent(c.sectionPath)}`}
                        onClick={() => fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "hr_citation_click", payload: { docId: c.docId } }) }).catch(() => {})}
                        title={`${c.title} — v${c.version}, effective ${c.effectiveDate}`}
                        className="bidi-isolate pressable hit-area rounded-full bg-surface px-2 py-1 text-xs font-medium text-ai-fg hover:opacity-80"
                      >
                        § {c.title} · {c.sectionPath.length > 24 ? c.sectionPath.slice(0, 24) + "…" : c.sectionPath}
                      </a>
                    ))}
                  </span>
                ) : null}
              </AiSurface>
            )}
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
                    className="hit-area rounded-control px-2 py-1 text-xs text-muted hover:bg-surface-2"
                  >
                    {fb === "up" ? "👍" : "👎"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {streaming !== null ? (
          <div dir="auto">
            <AiSurface>
              {streaming.length === 0 ? <Skeleton className="h-4 w-[160px]" /> : <span className="whitespace-pre-wrap">{renderLite(streaming)}</span>}
              <span className="stream-cursor ms-1" aria-hidden />
            </AiSurface>
          </div>
        ) : null}
        {ticketSent ? <Chip variant="success">Ticket sent to HR — they&#39;ll reply here and you&#39;ll get a notification.</Chip> : null}
        {escalateOffer && !ticketSent ? (
          <div>
            <PillButton onClick={() => setConfirmOpen(true)} className="text-primary">
              → Ask the HR team directly
            </PillButton>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {messages !== null && messages.length === 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {SEED_QUESTIONS.map((q) => (
            <PillButton key={q} onClick={() => ask(q)}>
              {q}
            </PillButton>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="composer-sticky z-10 mt-4 flex gap-2 border-t border-border bg-background py-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about any HR policy — any language"
          aria-label="Ask the HR assistant"
          dir="auto"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={streaming !== null || !input.trim()} className="px-3" aria-label="Send">
          ↑
        </Button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Share this conversation with HR?"
        body="Your name and this conversation will be shared with the HR team so they can help you directly. Nothing is shared until you confirm."
        confirmLabel="Share and create ticket"
        onConfirm={escalate}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
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
