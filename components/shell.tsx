import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import { logout, switchWorkspace } from "@/lib/auth/login";
import { readFlash } from "@/lib/flash";
import { ADMIN_NAV, MANAGER_NAV, LEARNER_NAV } from "@/lib/navigation";
import { LearnerDesktopNav, LearnerTabs, SideNav, WorkspaceMobileNav } from "./nav";
import { LearnerFrame } from "./learner-container";
import { CommandPalette } from "./palette";
import { ToastProvider } from "./toast";
import { Icon } from "./icons";
import { Brand } from "./brand";
import { AccountMenu } from "./account-menu";

async function unreadCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(t.notifications).where(and(eq(t.notifications.userId, userId), isNull(t.notifications.readAt)));
  return row?.n ?? 0;
}
const workspaceNames = { learner: "Learning workspace", admin: "Admin workspace", manager: "Manager workspace" };
function AccountActions({ user }: { user: CurrentUser }) {
  const ws = user.session.workspace;
  return <>
    {user.role !== "LEARNER" ? <form action={switchWorkspace.bind(null, ws === "learner" ? (user.role === "ADMIN" ? "admin" : "manager") : "learner")}>
      <button type="submit" className="header-control gap-2 px-3 text-sm"><Icon name="swap" size={18} />{ws === "learner" ? `Switch to ${user.role === "ADMIN" ? "admin" : "manager"}` : "View as learner"}</button>
    </form> : null}
    <form action={logout}><button type="submit" className="header-control gap-2 px-3 text-sm"><Icon name="logout" size={18} />Sign out</button></form>
  </>;
}
function Header({ user, unread, compact = false }: { user: CurrentUser; unread: number; compact?: boolean }) {
  const ws = user.session.workspace;
  const learner = ws === "learner";
  const home = learner ? "/home" : ws === "admin" ? "/admin" : "/team";
  const inbox = learner ? "/inbox" : `${home}/inbox`;
  return <header className={`app-header${compact ? " lesson-shell-header" : ""}`}>
    <div className="header-inner">
      {!learner ? <WorkspaceMobileNav items={ws === "admin" ? ADMIN_NAV : MANAGER_NAV} label={workspaceNames[ws]} /> : null}
      <Brand href={home} />
      {compact ? <Link href="/learn" className="header-control gap-2 px-3 text-sm"><Icon name="arrow-left" size={18} /><span>My Learning</span></Link> : learner ? <>
        <form action="/learn" method="get" role="search" aria-label="Course search" className="header-search">
          <label htmlFor="header-course-search" className="sr-only">Search courses</label>
          <input id="header-course-search" type="search" name="q" placeholder="What do you want to learn?" />
          <button type="submit" aria-label="Search courses"><Icon name="search" /></button>
        </form>
        <LearnerDesktopNav items={LEARNER_NAV} />
      </> : <p className="workspace-name text-sm font-semibold text-muted">{workspaceNames[ws]}</p>}
      <div className="header-controls">
        <Link href={inbox} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="header-control relative">
          <Icon name="bell" />{unread > 0 ? <span className="absolute end-0 top-0 rounded-full bg-primary px-1 text-xs font-semibold text-primary-fg">{unread > 99 ? "99+" : unread}</span> : null}
        </Link>
        <AccountMenu name={user.name} workspace={workspaceNames[ws]} actions={<AccountActions user={user} />} />
      </div>
    </div>
  </header>;
}
export async function LearnerShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const [unread, flash] = await Promise.all([unreadCount(user.id), readFlash()]);
  return <ToastProvider initial={flash}><LearnerFrame header={<Header user={user} unread={unread} />} lessonHeader={<Header user={user} unread={unread} compact />} tabs={<LearnerTabs items={LEARNER_NAV} />}>{children}</LearnerFrame></ToastProvider>;
}
export async function WorkspaceShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const [unread, flash] = await Promise.all([unreadCount(user.id), readFlash()]);
  const nav = user.session.workspace === "admin" ? ADMIN_NAV : MANAGER_NAV;
  const entries = [...nav.map(item => ({ label: item.label, href: item.href, group: item.group ?? "Workspace" })), { label: "Learner home", href: "/home", group: "Learner" }];
  return <ToastProvider initial={flash}><div className="min-h-dvh">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <Header user={user} unread={unread} />
    <div className="workspace-body"><SideNav items={nav} /><main id="main-content" tabIndex={-1} className="workspace-main"><div className="content-container">{children}</div></main></div>
    <CommandPalette entries={entries} />
  </div></ToastProvider>;
}
