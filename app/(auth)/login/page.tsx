"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction } from "../actions";
import { Button, Field, Input } from "@/components/ui";
import { AuthFrame } from "@/components/auth-frame";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [shared, setShared] = useState(false);
  return <AuthFrame title="Welcome back" description="Sign in with your employee ID and password.">
    <form action={action} aria-busy={pending}>
      <Field label="Employee ID"><Input name="employeeId" value={employeeId} onChange={e => setEmployeeId(e.target.value)} autoComplete="username" required autoFocus placeholder="e.g. AE10023" /></Field>
      <Field label="Password"><Input name="password" value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required /></Field>
      <label className="touch-target mb-4 flex items-center gap-3 text-sm"><input type="checkbox" name="shared" checked={shared} onChange={e => setShared(e.target.checked)} className="size-4 accent-primary" />This is a shared device</label>
      {state?.error ? <p role="alert" className="mb-4 rounded-input bg-destructive-tint p-3 text-sm text-destructive-text">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
    <p className="mt-6 text-sm">First time here? <Link className="link" href="/activate">Activate your account</Link></p>
    <p className="mt-4 text-sm text-muted">Forgot your password? Ask your manager for a reset code, then <Link className="link" href="/activate">set a new password</Link>.</p>
  </AuthFrame>;
}
