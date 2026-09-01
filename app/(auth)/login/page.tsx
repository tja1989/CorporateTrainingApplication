"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../actions";
import { Button, Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="animate-enter w-full max-w-sm p-6">
        <h1 className="font-ai-voice mb-1 text-2xl font-semibold">LuLu Learn</h1>
        <p className="mb-6 text-sm text-muted">Sign in with your employee ID.</p>
        <form action={action}>
          <Field label="Employee ID">
            <Input name="employeeId" autoComplete="username" required autoFocus placeholder="e.g. AE10023" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <label className="mb-4 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="shared" className="h-4 w-4" />
            This is a shared device
          </label>
          {state?.error ? (
            <p role="alert" className="mb-3 rounded-[--radius-control] bg-destructive-tint px-3 py-2 text-sm text-destructive-text">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link className="text-primary underline-offset-2 hover:underline" href="/activate">
            First time? Activate
          </Link>
          <span className="text-muted" title="Ask your manager to issue a reset code">Forgot? Ask your manager</span>
        </div>
      </Card>
    </main>
  );
}
