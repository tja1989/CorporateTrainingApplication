"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: string };

export function LearnerTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "touch-target flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
                active ? "text-primary" : "text-muted",
              )}
            >
              <span className="text-lg" aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* Desktop left rail */}
      <nav aria-label="Main" className="hidden w-52 shrink-0 flex-col gap-1 p-4 md:flex">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "rounded-[--radius-control] px-3 py-2 text-sm font-medium",
                active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <span className="me-2" aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex w-56 shrink-0 flex-col gap-1 border-e border-border p-4">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-[--radius-control] px-3 py-2 text-sm font-medium",
              active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <span className="me-2" aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
