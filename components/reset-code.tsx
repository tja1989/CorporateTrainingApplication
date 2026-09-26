"use client";
import { useState, useTransition } from "react";
import { Button } from "./ui";
/** The clear-text value only lives in this mounted result, never the URL/history. */
export function ResetCode({ action, label = "Issue password reset code" }: { action: () => Promise<string>; label?: string }) {
  const [code, setCode] = useState<string | null>(null); const [error, setError] = useState(""); const [pending, start] = useTransition();
  if (code) return <section aria-label="Issued reset code" className="rounded-input bg-surface-2 p-4"><h2 className="font-semibold">Reset code issued</h2><p className="my-3 font-mono text-xl">{code}</p><p className="text-sm text-muted">Share privately after verifying the employee’s identity. Valid for 14 days. The employee uses their ID and this code on the activation page. This value disappears when you leave or reload.</p><Button type="button" variant="secondary" className="mt-3" onClick={() => setCode(null)}>Hide code</Button></section>;
  return <div><Button type="button" variant="secondary" disabled={pending} onClick={() => { setError(""); start(async () => { try { setCode(await action()); } catch { setError("The reset code could not be issued. Check that this employee is still in your scope and try again."); } }); }}>{pending ? "Issuing code…" : label}</Button>{error ? <p role="alert" className="mt-2 text-sm text-destructive-text">{error}</p> : null}</div>;
}
