"use client";

import { Icon, IconDisc } from "@/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiSurface, Button, Card, Chip, Input, PillButton, PillAnchor, Skeleton, cx } from "@/components/ui";
import { EscalationPreviewChangedError } from "@/lib/hr/escalation";
import { EscalationPreview } from "@/components/escalation-preview";
import { CitationChips } from "@/components/citations";

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

export function HrChat({ userId, loginId, loadHistory = true, activeConversationId, sessionExpiresAt }: { userId: string; loginId: string; loadHistory?: boolean; activeConversationId?: string; sessionExpiresAt?: number | null }) {
  const [sessionLocked, setSessionLocked] = useState(false);
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [escalateOffer, setEscalateOffer] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [ticketSent, setTicketSent] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!loadHistory && !activeConversationId) { setMessages([]); return; }
    fetch(activeConversationId && !loadHistory ? `/api/hr?conversationId=${encodeURIComponent(activeConversationId)}` : "/api/hr")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        conversationRef.current = d.conversationId;
        setMessages(d.messages ?? []);
      })
      .catch(() => { setMessages([]); setError("Conversation history could not load. Refresh to try again."); });
  }, [loadHistory, activeConversationId]);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    let live = true, revision = 0, expired = false;
    const deadlinePassed = () => expired || Date.now() >= sessionExpiresAt;
    const expire = () => { expired = true; revision++; setSessionLocked(true); abortRef.current?.abort(); };
    const check = async () => {
      const current = ++revision;
      const cid = conversationRef.current;
      if (deadlinePassed()) { expire(); return; }
      if (!cid) return;
      setSessionLocked(true);
      try {
        const response = await fetch(`/api/hr/reauth?conversationId=${encodeURIComponent(cid)}`, { cache: "no-store" });
        const status = response.ok ? await response.json() : null;
        if (live && revision === current) {
          if (deadlinePassed()) expire();
          else setSessionLocked(!response.ok || status?.userId !== userId || status?.loginId !== loginId);
        }
      } catch { if (live && revision === current) setSessionLocked(true); }
    };
    const timer = setTimeout(expire, Math.max(0, sessionExpiresAt - Date.now()));
    window.addEventListener("focus", check); window.addEventListener("pageshow", check);
    return () => { live = false; clearTimeout(timer); window.removeEventListener("focus", check); window.removeEventListener("pageshow", check); };
  }, [sessionExpiresAt, userId, loginId]);

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
      setError(null);
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
              setMessages((m) => [...(m ?? []), { role: "assistant", content: "The assistant is unavailable right now — you can still reach HR with “Talk to a person”." }]);
              setStreaming(null);
              setEscalateOffer(true);
            }
          }
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) { setError("The assistant could not respond. Your question is kept below; try sending again."); setInput(question); }
        setStreaming(null);
      }
    },
    [streaming],
  );

  const escalate = useCallback(async (previewVersion: string) => {
    if (!conversationRef.current) throw new Error("No conversation");
    const res = await fetch("/api/hr/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversationRef.current, previewVersion }),
    });
    if (res.ok) {
      const d = await res.json();
      setTicketSent(d.ticketId);
      setEscalateOffer(false);
    } else if (res.status === 409) {
      throw new EscalationPreviewChangedError();
    } else {
      throw new Error("Ticket failed");
    }
  }, []);
  const previewEscalation = useCallback(async () => {
    const res = await fetch(`/api/hr/escalate?conversationId=${encodeURIComponent(conversationRef.current ?? "")}`);
    if (!res.ok) throw new Error("Preview failed");
    return res.json();
  }, []);

  if (sessionLocked) return <Card className="p-5"><p role="alert">This conversation is locked on the shared device.</p><a className="touch-target mt-3 inline-flex items-center text-link underline" href="/ask-hr">Verify to open stored history</a></Card>;

  return (
    <section aria-label="HR Assistant" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          HR Assistant <Chip variant="ai">AI</Chip>
        </span>
        <span className="flex flex-wrap gap-2">
          <PillAnchor href="/ask-hr/live"><Icon name="mic" size={14} /> Talk instead</PillAnchor>
          <PillButton onClick={() => setConfirmOpen(true)} disabled={!conversationRef.current || streaming !== null}>
            Talk to a person
          </PillButton>
        </span>
      </div>

      <div className="hr-messages flex flex-col gap-3" dir="auto">
        {messages === null ? (
          <div className="flex flex-col gap-2">
            <p role="status" className="text-sm text-muted">Loading conversation…</p>
            <Skeleton delayed className="h-4 w-2/3" />
            <Skeleton delayed className="h-4 w-1/2" />
          </div>
        ) : null}
        {messages !== null && messages.length === 0 ? (
          <div className="text-sm text-muted">
            <p className="mb-1">
              <Icon name="wave" size={16} className="me-1 inline align-text-bottom text-ai-fg" /> I&#39;m an <strong>AI assistant</strong> that answers questions about company HR policies, with the exact
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
                {m.citations && m.citations.length > 0 ? <CitationChips citations={m.citations} /> : null}
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
                      }).then(r => { if (!r.ok) throw new Error(); setFeedbackSent("Feedback recorded. Thank you."); }).catch(() => setFeedbackSent("Feedback could not be saved. Please try again."))
                    }
                    className="hit-area rounded-control px-2 py-1 text-xs text-muted hover:bg-surface-2"
                  >
                    <Icon name={fb === "up" ? "thumbs-up" : "thumbs-down"} size={16} />
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
              <span className="ms-2 text-sm text-muted" role="status">Responding…</span>
            </AiSurface>
          </div>
        ) : null}
        {ticketSent ? <p role="status" className="text-sm"><Chip variant="success">Ticket sent to HR</Chip> <a className="text-link underline" href={`/ask-hr/tickets/${ticketSent}`}>View your ticket</a></p> : null}
        {error ? <p role="alert" className="text-sm text-destructive-text">{error}</p> : null}
        {feedbackSent ? <p role="status" className="text-sm text-muted">{feedbackSent}</p> : null}
        {escalateOffer && !ticketSent ? (
          <div>
            <PillButton onClick={() => setConfirmOpen(true)}>
              Ask the HR team directly <Icon name="arrow-right" size={12} className="nudge" />
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
        className={cx((!!messages?.length || streaming !== null) && "composer-sticky", "z-10 mt-4 flex gap-2 border-t border-border bg-background py-2")}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about any HR policy — any language"
          aria-label="Ask the HR assistant"
          disabled={messages === null}
          dir="auto"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={messages === null || streaming !== null || !input.trim()} className="px-3" aria-label="Send">
          <Icon name="arrow-up" size={18} />
        </Button>
      </form>

      <EscalationPreview open={confirmOpen} load={previewEscalation} confirm={escalate} close={() => setConfirmOpen(false)} />
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
