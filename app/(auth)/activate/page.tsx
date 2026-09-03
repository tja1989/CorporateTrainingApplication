"use client";

import { useActionState } from "react";
import Link from "next/link";
import { activateAction } from "../actions";
import { Button, Card, Field, Input } from "@/components/ui";
import { Brand } from "@/components/brand";

export default function ActivatePage() {
  const [state, action, pending] = useActionState(activateAction, null);
  return (
    <main className="auth-hero flex min-h-dvh items-center justify-center px-4">
      <Card className="animate-enter w-full max-w-sm p-6 shadow-card">
        <Brand className="mb-4" />
        <h1 className="display mb-1 text-2xl">Activate your account</h1>
        <p className="mb-6 text-sm text-muted">Use the one-time code from your manager or HR.</p>
        <form action={action}>
          <Field label="Employee ID">
            <Input name="employeeId" required autoFocus placeholder="e.g. AE10023" />
          </Field>
          <Field label="Activation code">
            <Input name="code" required placeholder="XXXX-XXXX" className="uppercase" />
          </Field>
          <Field label="Choose a password" hint="At least 8 characters.">
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="Confirm password">
            <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          {state?.error ? (
            <p role="alert" className="mb-3 rounded-control bg-destructive-tint px-3 py-2 text-sm text-destructive-text">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Activating…" : "Activate & sign in"}
          </Button>
        </form>
        <p className="mt-4 text-sm">
          <Link className="link text-link" href="/login">
            Back to sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
