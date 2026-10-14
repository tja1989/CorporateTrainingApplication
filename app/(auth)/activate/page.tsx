"use client";
import { useActionState } from "react";
import Link from "next/link";
import { activateAction } from "../actions";
import { Button, Field, Input } from "@/components/ui";
import { AuthFrame } from "@/components/auth-frame";
import { useAuthFormValues } from "@/components/auth-form-values";

export default function ActivatePage() {
  const [state, action, pending] = useActionState(activateAction, null);
  const { values, setValues, formRef } = useAuthFormValues({ employeeId: "", code: "", password: "", confirm: "" });
  const change = (name: keyof typeof values, value: string) => setValues(previous => ({ ...previous, [name]: value }));
  return <AuthFrame title="Set up your account" description="Use the activation or password reset code from your manager or HR.">
    <form ref={formRef} action={action} aria-busy={pending}>
      <Field label="Employee ID"><Input name="employeeId" value={values.employeeId} onChange={e => change("employeeId", e.target.value)} autoComplete="username" required autoFocus placeholder="e.g. AE10023" /></Field>
      <Field label="Activation or reset code"><Input name="code" value={values.code} onChange={e => change("code", e.target.value)} autoComplete="one-time-code" required placeholder="XXXX-XXXX" className="uppercase" /></Field>
      <Field label="Choose a password" hint="Use at least 8 characters."><Input name="password" value={values.password} onChange={e => change("password", e.target.value)} type="password" autoComplete="new-password" required minLength={8} /></Field>
      <Field label="Confirm password"><Input name="confirm" value={values.confirm} onChange={e => change("confirm", e.target.value)} type="password" autoComplete="new-password" required minLength={8} /></Field>
      {state?.error ? <p role="alert" className="mb-4 rounded-control bg-destructive-tint p-3 text-sm text-destructive-text">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Setting up…" : "Save password & sign in"}</Button>
    </form>
    <p className="mt-6 text-sm"><Link className="link" href="/login">Back to sign in</Link></p>
  </AuthFrame>;
}
