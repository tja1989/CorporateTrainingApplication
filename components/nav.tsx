"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

export type NavItem = { href: string; label: string; icon: IconName };

/* The rail sits on charcoal in both themes: idle rows in the rail's muted
   tone, the active row in lime with a lime bar at its start edge. */
const railItem = "rail-row rounded-control px-3 py-2 text-sm font-medium";
const railActive = "bg-rail-hover text-accent";
const railIdle = "text-rail-muted hover:bg-rail-hover hover:text-rail-fg";

/* Navigation is a 100+×/day surface: no entry animation (spec §10.5 frequency
   rule). What moves is feedback only — the rail's hover reveal, the accent bar
   and the icon's hover scale — all on the fast token, driven from globals.css. */

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
      strokeWidth={1.75}
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
      className="rail-toggle pressable touch-target mb-1 flex items-center justify-center rounded-control text-rail-muted hover:bg-rail-hover hover:text-rail-fg"
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
      <span className="rail-icon flex w-6 shrink-0 justify-center" aria-hidden>
        <Icon name={item.icon} />
      </span>
      <span className="rail-label ms-2">{item.label}</span>
    </Link>
  );
}

export function LearnerTabs({ items, defaultCollapsed = false }: { items: NavItem[]; defaultCollapsed?: boolean }) {
  const pathname = usePathname();
  const { collapsed, toggle } = useRailCollapse(defaultCollapsed);
  return (
    <>
      {/* Mobile bottom tab bar — charcoal, the active icon lifted into a lime pill */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex bg-rail text-rail-muted md:hidden"
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
                "touch-target flex flex-1 flex-col items-center justify-center gap-1 pb-2 pt-1 text-xs font-medium",
                active ? "tab-active text-rail-fg" : "text-rail-muted",
              )}
            >
              <span className="tab-icon flex h-8 w-12 items-center justify-center rounded-full" aria-hidden>
                <Icon name={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* Desktop left rail — the <nav> holds the width in the flow, the panel overlays. */}
      <nav aria-label="Main" data-collapsed={collapsed ? "" : undefined} className="rail relative hidden shrink-0 md:block">
        <div className="rail-panel absolute inset-y-0 start-0 flex flex-col gap-1 bg-rail p-2 text-rail-fg">
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
        <div className="rail-panel absolute inset-y-0 start-0 flex flex-col gap-1 border-e border-rail-hover bg-rail p-2 text-rail-fg">
          <RailToggle collapsed={collapsed} onToggle={toggle} />
          {items.map((item) => (
            <RailLink key={item.href} item={item} active={isActive(item)} />
          ))}
        </div>
      </nav>
      <nav aria-label="Workspace" className="fixed inset-x-0 top-12 z-30 flex gap-1 overflow-x-auto bg-rail px-4 py-2 md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? "page" : undefined}
            className={cx(
              "pressable flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium",
              isActive(item) ? "bg-accent text-accent-fg" : "text-rail-muted hover:text-rail-fg",
            )}
          >
            <Icon name={item.icon} size={14} />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
