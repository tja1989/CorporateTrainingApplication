"use client";

import { useEffect, useState } from "react";
import { EscalationPreviewChangedError, type EscalationPayload } from "@/lib/hr/escalation";
import { Dialog } from "./dialog";
import { Button } from "./ui";

export function EscalationPreview({ open, load, confirm, close }: {
  open: boolean;
  load: () => Promise<EscalationPayload>;
  confirm: (version: string) => Promise<void>;
  close: () => void;
}) {
  const [payload, setPayload] = useState<EscalationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setPayload(null);
    setError(null);
    setChanged(false);
    load()
      .then(preview => {
        if (active) setPayload(preview);
      })
      .catch(() => {
        if (active) setError("The conversation preview could not load. Close this dialog and try again.");
      });
    return () => { active = false; };
  }, [open, load, refresh]);

  async function share() {
    if (!payload || busy || changed) return;
    setBusy(true);
    setError(null);
    try {
      await confirm(payload.version);
      close();
    } catch (error) {
      if (error instanceof EscalationPreviewChangedError) {
        setChanged(true);
        setError(error.message);
      } else {
        setError("The ticket was not created. Your conversation is still here; try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => { if (!busy) close(); }} title="Review what you will share with HR">
      <p className="mb-4 text-sm text-muted">HR will receive your name and the conversation below. Nothing is shared until you confirm.</p>
      {payload ? (
        <>
          <dl className="mb-3 text-sm">
            <dt className="font-semibold">Employee</dt>
            <dd className="mb-2">{payload.name}</dd>
            <dt className="font-semibold">Subject</dt>
            <dd>{payload.subject}</dd>
          </dl>
          <div aria-label="Conversation to share" className="mb-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-control border border-border p-3 text-sm">
            {payload.body}
          </div>
        </>
      ) : !error ? <p role="status" className="mb-4 text-sm text-muted">Loading the conversation preview…</p> : null}
      {error ? <p role="alert" className="mb-4 text-sm text-destructive-text">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button>
        {changed ? <Button variant="secondary" onClick={() => setRefresh(value => value + 1)}>Review updated conversation</Button> : null}
        <Button disabled={!payload || busy || changed} onClick={share}>
          {busy ? "Sharing…" : "Share and create ticket"}
        </Button>
      </div>
    </Dialog>
  );
}
