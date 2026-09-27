"use client";
import { useActionState, useLayoutEffect } from "react";
import Link from "next/link";
import { loginAction } from "../actions";
import { Button, Field, Input } from "@/components/ui";
import { AuthFrame } from "@/components/auth-frame";
import { useAuthFormValues } from "@/components/auth-form-values";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);
  const { values, setValues, formRef } = useAuthFormValues<{ employeeId: string; password: string; shared: boolean }>({ employeeId: "", password: "", shared: false });
  useLayoutEffect(() => {
    const form = formRef.current;
    // React resets native forms during commit, when synthetic event dispatch is
    // disabled. Retain the shared-device choice on returned validation errors.
    const preserveValues = (event: Event) => event.preventDefault();
    form?.addEventListener("reset", preserveValues);
    return () => form?.removeEventListener("reset", preserveValues);
  }, [formRef]);
  return <AuthFrame title="Welcome back" description="Sign in with your employee ID and password.">
    <form ref={formRef} action={action} aria-busy={pending}>
      <Field label="Employee ID"><Input name="employeeId" value={values.employeeId} onChange={e => setValues(previous => ({ ...previous, employeeId: e.target.value }))} autoComplete="username" required autoFocus placeholder="e.g. AE10023" /></Field>
      <Field label="Password"><Input name="password" value={values.password} onChange={e => setValues(previous => ({ ...previous, password: e.target.value }))} type="password" autoComplete="current-password" required /></Field>
      <label className="touch-target mb-4 flex items-center gap-3 text-sm"><input type="checkbox" name="shared" checked={values.shared} onChange={e => setValues(previous => ({ ...previous, shared: e.target.checked }))} className="size-4 accent-primary" />This is a shared device</label>
      {state?.error ? <p role="alert" className="mb-4 rounded-input bg-destructive-tint p-3 text-sm text-destructive-text">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
    <p className="mt-6 text-sm">First time here? <Link className="link" href="/activate">Activate your account</Link></p>
    <p className="mt-4 text-sm text-muted">Forgot your password? Ask your manager for a reset code, then <Link className="link" href="/activate">set a new password</Link>.</p>
  </AuthFrame>;
}
