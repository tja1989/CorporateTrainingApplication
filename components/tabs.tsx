"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { DUR, EASE_OUT } from "@/lib/motion";
import { cx } from "./ui";

const groupClass = "flex gap-1 rounded-full bg-surface-2 p-1";
const tabClass = "relative flex-1 touch-target rounded-full px-3 py-2 text-center text-sm font-medium transition-colors";
const indicatorTransition = { duration: DUR.base, ease: EASE_OUT };

function Indicator({ id }: { id: string }) {
  return <motion.span layoutId={id} className="absolute inset-0 rounded-full bg-surface shadow-card" transition={indicatorTransition} aria-hidden />;
}

/** Controlled tablist with a sliding indicator and arrow-key navigation. */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: Array<{ id: string; label: ReactNode }>;
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}) {
  const uid = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKey(e: KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? Math.min(i + 1, last) : e.key === "ArrowLeft" ? Math.max(i - 1, 0) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className={cx(groupClass, className)}>
      {tabs.map((tab, i) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(tabClass, active ? "text-foreground" : "text-muted hover:text-foreground")}
          >
            {active ? <Indicator id={uid} /> : null}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Link-driven tabs (report switchers, filters) with the same sliding indicator. */
export function LinkTabs({ items, label, className, param }: { items: Array<{ href: string; label: ReactNode }>; label: string; className?: string; param?: string }) {
  const uid = useId();
  const pathname = usePathname();
  const search = useSearchParams();
  function isActive(href: string): boolean {
    const [path, qs] = href.split("?");
    if (path !== pathname) return false;
    if (!param) return true;
    const want = new URLSearchParams(qs ?? "").get(param);
    const firstDefault = items[0] ? new URLSearchParams(items[0].href.split("?")[1] ?? "").get(param) : null;
    const current = search.get(param) ?? firstDefault;
    return current === want;
  }
  return (
    <nav aria-label={label} className={cx(groupClass, "w-fit max-w-full overflow-x-auto", className)}>
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cx(tabClass, "flex-none whitespace-nowrap", active ? "text-foreground" : "text-muted hover:text-foreground")}>
            {active ? <Indicator id={uid} /> : null}
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
