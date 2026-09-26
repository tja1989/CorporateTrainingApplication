"use client";
import { useState } from "react";
import { Button, Field, Textarea } from "@/components/ui";
import { replyToTicketAction } from "./actions";
export function TicketReply({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  return <form onSubmit={async e => { e.preventDefault(); setBusy(true); setStatus(null); const form = new FormData(); form.set("body", body); try { const result = await replyToTicketAction(ticketId, form); if (result?.error) setStatus(result.error); else { window.location.assign(`/ask-hr/tickets/${ticketId}?sent=1`); } } catch { setStatus("Your reply could not be sent. Please try again."); } finally { setBusy(false); } }}><Field label="Reply to HR"><Textarea name="body" rows={4} maxLength={4000} required value={body} onChange={e => setBody(e.target.value)} placeholder="Add more details…" /></Field>{status ? <p role="status" className="my-3 text-sm text-muted">{status}</p> : null}<Button className="mt-3" disabled={busy || !body.trim()} type="submit">{busy ? "Sending…" : "Send reply"}</Button></form>;
}
