"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, cx } from "./ui";

/**
 * Elevation L2 overlay on the native <dialog> element: focus trap, Escape,
 * inert background and a flat scrim come for free. No frosted glass.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-32px)] max-w-lg rounded-card border border-border bg-surface p-6 text-foreground shadow-overlay backdrop:bg-scrim open:animate-enter",
        className,
      )}
    >
      <h2 id={titleId} className="display mb-3 text-xl">
        {title}
      </h2>
      {children}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="mb-6 text-sm text-muted">{body}</div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="button" variant={destructive ? "destructive" : "primary"} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
