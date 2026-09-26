"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavHref, type NavItem } from "@/lib/navigation";
import { Icon } from "./icons";
import { Dialog } from "./dialog";
export type { NavItem } from "@/lib/navigation";

export function LearnerDesktopNav({ items }: { items: NavItem[] }) {
  const active = activeNavHref(usePathname(), items);
  return <nav aria-label="Main" className="desktop-learner-nav">{items.filter(item => item.href !== "/profile").map(item => <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined} className="header-nav-link">{item.label}</Link>)}</nav>;
}

/** Always-labeled five-tab mobile navigation. The legacy collapse preference is intentionally ignored. */
export function LearnerTabs({ items }: { items: NavItem[]; defaultCollapsed?: boolean }) {
  const active = activeNavHref(usePathname(), items);
  return <nav aria-label="Mobile main" className="mobile-tabs">{items.map(item => <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined} className="mobile-tab"><Icon name={item.icon} /><span>{item.href === "/learn" ? "Learning" : item.label}</span></Link>)}</nav>;
}

/** Fresh document navigation avoids interrupted Flight transitions and rechecks workspace scope on every selection. */
function WorkspaceLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const active = activeNavHref(usePathname(), items);
  return <nav aria-label="Workspace">{items.map((item, index) => <Fragment key={item.href}>
    {item.group && item.group !== items[index - 1]?.group ? <p className="workspace-group">{item.group}</p> : null}
    <a href={item.href} onClick={onNavigate} aria-current={active === item.href ? "page" : undefined} className="workspace-nav-link"><Icon name={item.icon} size={20} className="shrink-0" /><span>{item.label}</span></a>
  </Fragment>)}</nav>;
}

export function SideNav({ items }: { items: NavItem[]; defaultCollapsed?: boolean }) {
  return <aside className="workspace-sidebar"><WorkspaceLinks items={items} /></aside>;
}

export function WorkspaceMobileNav({ items, label }: { items: NavItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  return <>
    <button ref={triggerRef} type="button" className="header-control workspace-mobile-trigger" aria-label={`Open ${label.toLowerCase()} navigation`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}><Icon name="menu" /></button>
    <Dialog id={id} open={open} onClose={() => setOpen(false)} title={label} className="workspace-drawer" returnFocusRef={triggerRef}>
      <button type="button" className="header-control absolute end-3 top-3" onClick={() => setOpen(false)} aria-label="Close navigation"><Icon name="x" /></button>
      <WorkspaceLinks items={items} onNavigate={() => setOpen(false)} />
    </Dialog>
  </>;
}
