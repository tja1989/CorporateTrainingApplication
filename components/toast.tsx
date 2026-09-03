"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DUR, EASE_OUT } from "@/lib/motion";
import { cx } from "./ui";
import { Icon, type IconName } from "./icons";

export type Toast = { id: number; message: string; tone?: "neutral" | "success" | "warning" | "destructive" };
export type Flash = Omit<Toast, "id">;

const Ctx = createContext<{ push: (t: Flash) => void } | null>(null);

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/* Each tone is an icon in its own tinted disc — the message stays on the surface. */
const toneStyle: Record<NonNullable<Toast["tone"]>, { icon: IconName; disc: string }> = {
  neutral: { icon: "bell", disc: "bg-surface-2 text-foreground" },
  success: { icon: "check", disc: "bg-success-tint text-success-fg" },
  warning: { icon: "warning", disc: "bg-warning-tint text-warning-fg" },
  destructive: { icon: "x", disc: "bg-destructive-tint text-destructive-text" },
};

const FLASH_COOKIE = "ll_flash";

/**
 * Elevation L2 toasts for server-action outcomes. Server actions set a short
 * lived `ll_flash` cookie (lib/flash.ts); the shell passes it in as `initial`
 * and the provider shows it once, then clears the cookie client-side.
 */
export function ToastProvider({ initial, children }: { initial?: Flash | null; children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (t: Flash) => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-2), { ...t, id }]);
      timers.current.set(id, setTimeout(() => dismiss(id), 4000));
    },
    [dismiss],
  );

  useEffect(() => {
    if (!initial) return;
    push(initial);
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-12 z-50 flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:end-6 md:items-end"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const tone = toneStyle[t.tone ?? "neutral"];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: DUR.base, ease: EASE_OUT }}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm text-foreground shadow-overlay"
              >
                <span className={cx("animate-pop flex size-8 shrink-0 items-center justify-center rounded-full", tone.disc)} aria-hidden>
                  <Icon name={tone.icon} size={16} />
                </span>
                <span className="flex-1 pt-1">{t.message}</span>
                <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="hit-area pt-1 text-muted hover:text-foreground">
                  <Icon name="x" size={16} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
