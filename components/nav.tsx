"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: string };

const railItem = "rounded-control px-3 py-2 text-sm font-medium";
const railActive = "bg-surface-2 text-foreground";
const railIdle = "text-muted hover:bg-surface-2 hover:text-foreground";

/* Navigation is a 100+×/day surface: no animation (spec §10.5 frequency rule). */

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
                "touch-target flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium",
                active ? "text-primary" : "text-muted",
              )}
            >
              <span className="text-base" aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* Desktop left rail */}
      <nav aria-label="Main" className="hidden w-rail shrink-0 flex-col gap-1 p-4 md:flex">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cx(railItem, active ? railActive : railIdle)}>
              <span className="me-2" aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/** Workspace nav: a left rail on md+, a horizontally scrolling strip on phones (toolbars may scroll sideways). */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
  return (
    <>
      <nav aria-label="Workspace" className="hidden w-rail shrink-0 flex-col gap-1 border-e border-border p-4 md:flex">
        {items.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(item) ? "page" : undefined} className={cx(railItem, isActive(item) ? railActive : railIdle)}>
            <span className="me-2" aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Workspace" className="fixed inset-x-0 top-12 z-30 flex gap-1 overflow-x-auto border-b border-border bg-background px-4 py-2 md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? "page" : undefined}
            className={cx("shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium", isActive(item) ? "bg-surface-2 text-foreground" : "text-muted")}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
