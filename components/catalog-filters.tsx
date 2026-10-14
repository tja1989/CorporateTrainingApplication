"use client";
import { useEffect, useState, type ReactNode } from "react";
/** Secondary filters remain one form and one source of values at every width. */
export function CatalogFilters({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setOpen(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return <details className="mt-3" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary className="touch-target cursor-pointer py-3 text-sm font-medium md:hidden">Filters{activeCount ? ` (${activeCount} active)` : ""}</summary><div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div></details>;
}
