"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: string };

const railItem = "rounded-control px-3 py-2 text-sm font-medium";
const railActive = "bg-surface-2 text-foreground";
const railIdle = "text-muted hover:bg-surface-2 hover:text-foreground";

/* Navigation is a 100+×/day surface: no animation (spec §10.5 frequency rule). */

/**
 * Collapse the desktop rail to its icons. The choice is a cookie, so the server
 * renders the right width on the next navigation and the rail never flashes
 * open before hydration. Phones keep the bottom tab bar either way.
 */
function useRailCollapse(initial: boolean) {
  const [collapsed, setCollapsed] = useState(initial);
  const toggle = () => {
    setCollapsed((was) => {
      const next = !was;
      document.cookie = `ll_nav=${next ? "collapsed" : "open"};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  };
  return { collapsed, toggle };
}

function RailToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      title={collapsed ? "Expand navigation" : "Collapse navigation"}
      className={cx(
        "pressable touch-target mb-1 flex items-center rounded-control text-base text-muted hover:bg-surface-2 hover:text-foreground",
        // Expanded, it lines up with the item labels; collapsed, with the icons.
        collapsed ? "justify-center" : "justify-start px-3",
      )}
    >
      <span aria-hidden>▥</span>
    </button>
  );
}

/** One rail row, labelled either by its text or — when collapsed — by aria-label. */
function RailLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cx(
        railItem,
        active ? railActive : railIdle,
        collapsed && "flex touch-target items-center justify-center px-2",
      )}
    >
      <span className={collapsed ? undefined : "me-2"} aria-hidden>{item.icon}</span>
      {collapsed ? null : item.label}
    </Link>
  );
}

export function LearnerTabs({ items, defaultCollapsed = false }: { items: NavItem[]; defaultCollapsed?: boolean }) {
  const pathname = usePathname();
  const { collapsed, toggle } = useRailCollapse(defaultCollapsed);
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
      <nav aria-label="Main" className={cx("hidden shrink-0 flex-col gap-1 md:flex", collapsed ? "w-rail-sm p-2" : "w-rail p-4")}>
        <RailToggle collapsed={collapsed} onToggle={toggle} />
        {items.map((item) => (
          <RailLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>
    </>
  );
}

/** Workspace nav: a left rail on md+, a horizontally scrolling strip on phones (toolbars may scroll sideways). */
export function SideNav({ items, defaultCollapsed = false }: { items: NavItem[]; defaultCollapsed?: boolean }) {
  const pathname = usePathname();
  const { collapsed, toggle } = useRailCollapse(defaultCollapsed);
  const isActive = (item: NavItem) => pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
  return (
    <>
      <nav
        aria-label="Workspace"
        className={cx("hidden shrink-0 flex-col gap-1 border-e border-border md:flex", collapsed ? "w-rail-sm p-2" : "w-rail p-4")}
      >
        <RailToggle collapsed={collapsed} onToggle={toggle} />
        {items.map((item) => (
          <RailLink key={item.href} item={item} collapsed={collapsed} active={isActive(item)} />
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
