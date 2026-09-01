"use client";

import { useActionState } from "react";
import { mfaSetupConfirm } from "../../actions";
import { Button, Field, Input } from "@/components/ui";

export function MfaSetupForm({ secret }: { secret: string }) {
  const [state, action, pending] = useActionState(mfaSetupConfirm, null);
  return (
    <form action={action}>
      <input type="hidden" name="secret" value={secret} />
      <Field label="Code from your app">
        <Input name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} required autoFocus />
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
