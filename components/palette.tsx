"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Entry = { label: string; href: string; group: string };

export function CommandPalette({ entries }: { entries: Entry[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setSel(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries.slice(0, 8);
    // subsequence fuzzy match
    return entries
      .filter((e) => {
        const hay = e.label.toLowerCase();
        let i = 0;
        for (const ch of needle) {
          i = hay.indexOf(ch, i);
          if (i < 0) return false;
          i++;
        }
        return true;
      })
      .slice(0, 8);
  }, [q, entries]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim pt-[15vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Command palette"
    >
      {/* No entry animation: 100+×/day surface (spec §10.5 frequency rule) */}
      <div
        className="w-full max-w-lg rounded-card border border-border bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, results.length - 1));
            else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            else if (e.key === "Enter" && results[sel]) {
              setOpen(false);
              router.push(results[sel].href);
            }
          }}
          placeholder="Jump to…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-base outline-none"
          aria-label="Search destinations"
        />
        <ul className="p-2">
          {results.map((r, i) => (
            <li key={r.href}>
              <button
                type="button"
                className={`flex w-full items-center justify-between rounded-control px-3 py-2 text-start text-sm ${i === sel ? "bg-surface-2" : ""}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => {
                  setOpen(false);
                  router.push(r.href);
                }}
              >
                <span>{r.label}</span>
                <span className="text-xs text-muted">{r.group}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="px-3 py-2 text-sm text-muted">No matches</li> : null}
        </ul>
      </div>
    </div>
  );
}
