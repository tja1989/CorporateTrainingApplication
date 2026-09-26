"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx } from "./ui";

export type ActionResult = { error?: string; success?: string; href?: string; codes?: string[] };
/** Server validation errors leave the live form intact, including its values. */
export function WorkspaceForm({ action, children, className, success = "Changes saved.", reload = true }: {
  action: (form: FormData) => Promise<ActionResult | void>;
  children: ReactNode; className?: string; success?: string; reload?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [result, setResult] = useState<ActionResult | null>(null);
  return <form method="post" className={className} aria-busy={!ready || pending} onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await action(data);
        if (response?.error) { setResult(response); return; }
        if (response?.href) { window.location.assign(response.href); return; }
        if (response?.codes || !reload) { setResult(response ?? { success }); return; }
        window.location.reload();
      } catch {
        setResult({ error: "Your changes could not be saved. Your entries are still here; try again." });
      }
    });
  }}>
    <fieldset disabled={!ready || pending} className="min-w-0">{children}</fieldset>
    {!ready ? <p role="status" className="mt-3 text-sm text-muted">Preparing form…</p> : null}
    <noscript><p className="mt-3 text-sm text-muted">Enable JavaScript to use this form.</p></noscript>
    {pending ? <p role="status" className="mt-3 text-sm text-muted">Saving…</p> : null}
    {result?.error ? <p role="alert" className="mt-3 whitespace-pre-line rounded-input bg-destructive-tint p-3 text-sm text-destructive-text">{result.error}</p> : null}
    {result?.success ? <p role="status" className="mt-3 text-sm text-success-fg">{result.success}</p> : null}
    {result?.codes?.length ? <section aria-label="One-time activation codes" className="mt-4 rounded-input bg-surface-2 p-4"><h3 className="font-semibold">Activation codes — shown once</h3><p className="my-2 text-sm text-muted">Share privately after checking each employee’s identity. Codes expire in 14 days and disappear when you leave or reload this page.</p><pre className="whitespace-pre-wrap break-all text-sm">{result.codes.join("\n")}</pre></section> : null}
  </form>;
}
export function SubmitButton({ children, className, variant = "primary" }: { children: ReactNode; className?: string; variant?: "primary" | "secondary" | "destructive" | "ghost" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} variant={variant} className={cx(className)}>{pending ? "Saving…" : children}</Button>;
}
