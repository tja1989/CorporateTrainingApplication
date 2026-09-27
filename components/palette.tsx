"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { Dialog } from "./dialog";
import { Button } from "./ui";

type Entry = { label: string; href: string; group: string };
export function CommandPalette({ entries }: { entries: Entry[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setOpen(previous => !previous); setQ(""); setSel(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(entry => {
      let index = 0;
      for (const character of needle) { index = entry.label.toLowerCase().indexOf(character, index); if (index < 0) return false; index++; }
      return true;
    }).slice(0, 8);
  }, [q, entries]);
  const choose = (entry: Entry) => { setOpen(false); router.push(entry.href); };
  return <Dialog open={open} onClose={() => setOpen(false)} title="Find a workspace page">
    <div className="mb-3 flex items-center gap-2 rounded-input border border-border px-3">
      <Icon name="search" className="shrink-0 text-muted" />
      <input ref={inputRef} value={q} onChange={event => { setQ(event.target.value); setSel(0); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSel(index => Math.max(0, Math.min(results.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
        else if (event.key === "Enter" && results[sel]) { event.preventDefault(); choose(results[sel]); }
      }} placeholder="Search pages…" className="touch-target w-full bg-transparent py-3 text-base" aria-label="Search destinations" />
    </div>
    <ul className="space-y-1">{results.map((entry, index) => <li key={entry.href}><button type="button" className={`touch-target flex w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-start text-sm ${index === sel ? "bg-accent-tint text-primary" : "hover:bg-surface-2"}`} onMouseEnter={() => setSel(index)} onClick={() => choose(entry)}><span>{entry.label}</span><span className="text-xs text-muted">{entry.group}</span></button></li>)}</ul>
    {!results.length ? <p role="status" className="py-4 text-sm text-muted">No matching pages. Try a different name.</p> : null}
    <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => setOpen(false)}>Close</Button></div>
  </Dialog>;
}
