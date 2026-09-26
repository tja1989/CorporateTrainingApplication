"use client";
import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { Button } from "./ui";
export type EscalationPayload = { name: string; subject: string; body: string };
export function EscalationPreview({ open, load, confirm, close }: { open: boolean; load: () => Promise<EscalationPayload>; confirm: () => Promise<void>; close: () => void }) {
  const [payload, setPayload] = useState<EscalationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; let active = true; setPayload(null); setError(null); load().then(p => { if (active) setPayload(p); }).catch(() => { if (active) setError("The conversation preview could not load. Close this dialog and try again."); }); return () => { active = false; }; }, [open, load]);
  return <Dialog open={open} onClose={() => { if (!busy) close(); }} title="Review what you will share with HR"><p className="mb-4 text-sm text-muted">HR will receive your name and the conversation below. Nothing is shared until you confirm.</p>{payload ? <><dl className="mb-3 text-sm"><dt className="font-semibold">Employee</dt><dd className="mb-2">{payload.name}</dd><dt className="font-semibold">Subject</dt><dd>{payload.subject}</dd></dl><div aria-label="Conversation to share" className="mb-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-control border border-border p-3 text-sm">{payload.body}</div></> : !error ? <p role="status" className="mb-4 text-sm text-muted">Loading the conversation preview…</p> : null}{error ? <p role="alert" className="mb-4 text-sm text-destructive-text">{error}</p> : null}<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button disabled={!payload || busy} onClick={async () => { setBusy(true); setError(null); try { await confirm(); close(); } catch { setError("The ticket was not created. Your conversation is still here; try again."); } finally { setBusy(false); } }}>{busy ? "Sharing…" : "Share and create ticket"}</Button></div></Dialog>;
}
