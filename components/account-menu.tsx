"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { ThemeToggle } from "./theme-toggle";

/** A disclosure of ordinary links/actions; native Tab order remains intact. */
export function AccountMenu({ name, workspace, actions }: { name: string; workspace: string; actions: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => { if (ref.current) ref.current.open = false; }, [pathname]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && ref.current?.open) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, []);
  return <details ref={ref} className="account-menu">
    <summary className="header-control gap-2" aria-label="Profile and account"><Icon name="user" /><Icon name="chevron-down" size={14} /></summary>
    <div className="account-panel">
      <p className="break-words font-semibold">{name}</p>
      <p className="mb-3 text-sm text-muted">{workspace}</p>
      <Link href="/profile" className="header-control gap-2 px-3 text-sm"><Icon name="user" size={18} />My profile</Link>
      <ThemeToggle showLabel className="header-control gap-2 px-3 text-sm" />
      <div className="mt-2 border-t border-border pt-2">{actions}</div>
    </div>
  </details>;
}
