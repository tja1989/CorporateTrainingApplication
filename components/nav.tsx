"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: string };

const railItem = "rounded-control px-3 py-2 text-sm font-medium";
const railActive = "bg-surface-2 text-foreground";
const railIdle = "text-muted hover:bg-surface-2 hover:text-foreground";

/* Navigation is a 100+×/day surface: no animation (spec §10.5 frequency rule).
   The one exception is the rail's hover reveal — it has to move or it snaps —
   held to the fast token and driven from CSS in globals.css (§10.7). */

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

/** Points to the start when the rail is pinned open, to the end when collapsed. */
function RailChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className="rail-chevron"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={collapsed ? "m6.25 4 4 4-4 4" : "m9.75 4-4 4 4 4"} />
    </svg>
  );
}

function RailToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Keep navigation open" : "Collapse navigation"}
      title={collapsed ? "Keep navigation open" : "Collapse navigation"}
      className="rail-toggle pressable touch-target mb-1 flex items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-foreground"
    >
      <RailChevron collapsed={collapsed} />
    </button>
  );
}

/**
 * One rail row. The shape never changes between states — the label is always
 * rendered and always read by assistive tech; CSS clips it when the rail is
 * narrow. That keeps the icon on a fixed centre line, so nothing shifts as the
 * panel widens.
 */
function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx("flex touch-target items-center", railItem, active ? railActive : railIdle)}
    >
      <span className="flex w-6 shrink-0 justify-center text-base" aria-hidden>{item.icon}</span>
      <span className="rail-label ms-2">{item.label}</span>
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
      {/* Desktop left rail — the <nav> holds the width in the flow, the panel overlays. */}
      <nav aria-label="Main" data-collapsed={collapsed ? "" : undefined} className="rail relative hidden shrink-0 md:block">
        <div className="rail-panel absolute inset-y-0 start-0 flex flex-col gap-1 bg-background p-2">
          <RailToggle collapsed={collapsed} onToggle={toggle} />
          {items.map((item) => (
            <RailLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
          ))}
        </div>
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
      <nav aria-label="Workspace" data-collapsed={collapsed ? "" : undefined} className="rail relative hidden shrink-0 md:block">
        {/* The divider rides the panel, not the nav, so it travels with what is visible. */}
        <div className="rail-panel absolute inset-y-0 start-0 flex flex-col gap-1 border-e border-border bg-background p-2">
          <RailToggle collapsed={collapsed} onToggle={toggle} />
          {items.map((item) => (
            <RailLink key={item.href} item={item} active={isActive(item)} />
          ))}
        </div>
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
