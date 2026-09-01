"use client";

import { useActionState } from "react";
import { mfaVerifyAction } from "../../actions";
import { Button, Card, Field, Input } from "@/components/ui";

export default function MfaPage() {
  const [state, action, pending] = useActionState(mfaVerifyAction, null);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="animate-enter w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-medium">Two-factor check</h1>
        <p className="mb-6 text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
        <form action={action}>
          <Field label="Code">
            <Input name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} required autoFocus />
          </Field>
          {state?.error ? (
            <p role="alert" className="mb-3 rounded-control bg-destructive-tint px-3 py-2 text-sm text-destructive-text">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Checking…" : "Verify"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
