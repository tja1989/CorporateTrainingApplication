"use client";
import { useActionState, useState } from "react";
import { mfaVerifyAction } from "../../actions";
import { Button, Field, Input } from "@/components/ui";
import { AuthFrame } from "@/components/auth-frame";

export default function MfaPage() {
  const [state, action, pending] = useActionState(mfaVerifyAction, null);
  const [code, setCode] = useState("");
  return <AuthFrame title="Verify it’s you" description="Enter the 6-digit code from your authenticator app.">
    <form action={action} aria-busy={pending}>
      <Field label="Authenticator code"><Input name="code" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /></Field>
      {state?.error ? <p role="alert" className="mb-4 rounded-control bg-destructive-tint p-3 text-sm text-destructive-text">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Checking…" : "Verify & continue"}</Button>
    </form>
    <p className="mt-6 text-sm text-muted">Can’t access your authenticator? Contact your administrator for account help.</p>
  </AuthFrame>;
}
