"use client";

import { useActionState } from "react";
import { mfaSetupConfirm } from "../../actions";
import { Button, Field, Input } from "@/components/ui";
import { useAuthFormValues } from "@/components/auth-form-values";

export function MfaSetupForm({ secret }: { secret: string }) {
  const [state, action, pending] = useActionState(mfaSetupConfirm, null);
  const { values, setValues, formRef } = useAuthFormValues({ code: "" });
  return (
    <form ref={formRef} action={action} aria-busy={pending}>
      <input type="hidden" name="secret" value={secret} />
      <Field label="Code from your app">
        <Input name="code" value={values.code} onChange={e => setValues({ code: e.target.value })} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus />
      </Field>
      {state?.error ? (
        <p role="alert" className="mb-3 rounded-control bg-destructive-tint px-3 py-2 text-sm text-destructive-text">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Confirming…" : "Confirm & continue"}
      </Button>
    </form>
  );
}
