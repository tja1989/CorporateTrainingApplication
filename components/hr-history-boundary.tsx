"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Button, ButtonAnchor, Card, Input, PageTitle } from "./ui";

export function HrHistoryUnlock({ newConversationBelow = false }: { newConversationBelow?: boolean } = {}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <Card className="hr-history-unlock mb-5 p-5">
    <h2 className="mb-2 text-lg font-semibold">Your HR history is private</h2>
    <p className="mb-4 text-sm text-muted">On this shared device, verify your password to open stored conversations and tickets for five minutes.{newConversationBelow ? " You can start a new conversation below." : " Open HR Help to continue with the account currently signed in."}</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError(null);
      try {
        const response = await fetch("/api/hr/reauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Verification failed. Please try again.");
        window.location.reload();
      } catch (error) { setError(error instanceof Error ? error.message : "Verification failed. Please try again."); setBusy(false); }
    }}>
      <label className="mb-2 block text-sm font-medium" htmlFor="hr-history-password">Confirm your password</label>
      <Input id="hr-history-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} />
      {error ? <p role="alert" className="mt-3 text-sm text-destructive-text">{error}</p> : null}
      <Button className="mt-3" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and open history"}</Button>
    </form>
    {!newConversationBelow ? <ButtonAnchor className="mt-3" variant="secondary" href="/ask-hr">Open HR Help</ButtonAnchor> : null}
  </Card>;
}

/** Remove historical content on expiry or restored/cross-tab session changes. */
export function HrHistoryBoundary({ expiresAt, conversationId, userId, loginId, sessionOnly = false, children }: {
  expiresAt: number | null; conversationId?: string | null; userId: string; loginId: string; sessionOnly?: boolean; children: ReactNode;
}) {
  const [locked, setLocked] = useState(expiresAt !== null && expiresAt <= Date.now());
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let live = true, revision = 0;
    const hide = () => { revision++; setChecking(true); };
    const check = async () => {
      const current = ++revision;
      if (expiresAt !== null && Date.now() >= expiresAt) { setLocked(true); return; }
      setChecking(true);
      try {
        const query = conversationId ? `conversationId=${encodeURIComponent(conversationId)}` : sessionOnly ? "scope=session" : "";
        const response = await fetch(`/api/hr/reauth${query ? `?${query}` : ""}`, { cache: "no-store" });
        const status = response.ok ? await response.json() : null;
        if (live && revision === current) setLocked(!response.ok || status?.userId !== userId || status?.loginId !== loginId);
      } catch { if (live && revision === current) setLocked(true); }
      finally { if (live && revision === current) setChecking(false); }
    };
    const timer = expiresAt === null ? undefined : setTimeout(() => setLocked(true), Math.max(0, expiresAt - Date.now()));
    window.addEventListener("focus", check); window.addEventListener("pageshow", check); window.addEventListener("pagehide", hide);
    const visibility = () => { if (document.visibilityState === "visible") void check(); else hide(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { live = false; clearTimeout(timer); window.removeEventListener("focus", check); window.removeEventListener("pageshow", check); window.removeEventListener("pagehide", hide); document.removeEventListener("visibilitychange", visibility); };
  }, [expiresAt, conversationId, userId, loginId, sessionOnly]);
  return locked ? <div><PageTitle>HR Help</PageTitle><HrHistoryUnlock /></div> : <><div hidden={checking}>{children}</div>{checking ? <p role="status">Checking this session…</p> : null}</>;
}
