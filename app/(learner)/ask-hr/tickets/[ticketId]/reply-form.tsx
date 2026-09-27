"use client";
import { useEffect, useState } from "react";
import { Button, Field, Textarea } from "@/components/ui";
import { replyToTicketAction } from "./actions";

export function TicketReply({ ticketId }: { ticketId: string }) {
  const [ready, setReady] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setReady(true), []);
  return <form method="post" aria-busy={!ready || busy} onSubmit={async event => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setStatus(null);
    const form = new FormData(); form.set("body", body);
    try {
      const result = await replyToTicketAction(ticketId, form);
      if (result?.error) setStatus(result.error);
      else window.location.assign(`/ask-hr/tickets/${ticketId}?sent=1`);
    } catch { setStatus("Your reply could not be sent. Please try again."); }
    finally { setBusy(false); }
  }}>
    <Field label="Reply to HR"><Textarea name="body" rows={4} maxLength={4000} required value={body} onChange={event => setBody(event.target.value)} placeholder="Add more details…" disabled={!ready || busy} /></Field>
    {!ready ? <p role="status" className="my-3 text-sm text-muted">Loading reply form…</p> : null}
    {status ? <p role="status" className="my-3 text-sm text-muted">{status}</p> : null}
    <Button className="mt-3" disabled={!ready || busy || !body.trim()} type="submit">{busy ? "Sending…" : "Send reply"}</Button>
  </form>;
}
