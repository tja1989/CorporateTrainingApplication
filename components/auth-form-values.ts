"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Preserve native input entered before hydration without changing server-action
 * submission or controlled value retention after validation errors. */
export function useAuthFormValues<T extends Record<string, string | boolean>>(initialValues: T) {
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useRef(initialValues);
  const [values, setValues] = useState(initialValues);
  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const entered = { ...initial.current };
    // The caller's editable keys are the allowlist. Hidden action metadata and
    // MFA setup secrets are never read; the snapshot remains in component state.
    for (const name of Object.keys(entered) as (keyof T)[]) {
      const input = form.elements.namedItem(String(name));
      if (input instanceof HTMLInputElement) {
        entered[name] = (typeof entered[name] === "boolean" ? input.checked : input.value) as T[keyof T];
      }
    }
    setValues(entered);
  }, []);
  return { values, setValues, formRef };
}
