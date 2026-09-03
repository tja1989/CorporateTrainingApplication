"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../actions";
import { Button, Card, Field, Input } from "@/components/ui";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <main className="auth-hero flex min-h-dvh items-center justify-center px-4">
      <Card className="animate-enter w-full max-w-sm p-6 shadow-card">
        <Brand className="mb-4" />
        <h1 className="display mb-1 text-2xl">Welcome back</h1>
        <p className="mb-6 text-sm text-muted">Sign in with your employee ID.</p>
        <form action={action}>
          <Field label="Employee ID">
            <Input name="employeeId" autoComplete="username" required autoFocus placeholder="e.g. AE10023" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <label className="mb-4 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="shared" className="size-4 accent-primary" />
            This is a shared device
          </label>
          {state?.error ? (
            <p role="alert" className="animate-enter mb-3 flex items-center gap-2 rounded-input bg-destructive-tint px-3 py-2 text-sm text-destructive-text">
              <Icon name="warning" size={16} className="shrink-0" />
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
            {!pending ? <Icon name="arrow-right" size={16} className="nudge" /> : null}
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link className="link text-link" href="/activate">
            First time? Activate
          </Link>
          <span className="text-muted" title="Ask your manager to issue a reset code">Forgot? Ask your manager</span>
        </div>
      </Card>
    </main>
  );
}
