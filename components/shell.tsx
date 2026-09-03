import Link from "next/link";
import { cookies } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import { logout, switchWorkspace } from "@/lib/auth/login";
import { readFlash } from "@/lib/flash";
import { LearnerTabs, SideNav, type NavItem } from "./nav";
import { LearnerContainer } from "@/components/learner-container";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./palette";
import { ToastProvider } from "./toast";
import { Chip, PillButton } from "./ui";

const LEARNER_TABS: NavItem[] = [
  { href: "/home", label: "Home", icon: "⌂" },
  { href: "/learn", label: "Learn", icon: "▤" },
  { href: "/drill", label: "Drill", icon: "◎" },
  { href: "/ask-hr", label: "Ask HR", icon: "✳" },
  { href: "/profile", label: "Profile", icon: "◍" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "⌗" },
  { href: "/admin/courses", label: "Courses", icon: "▤" },
  { href: "/admin/people", label: "People & rules", icon: "◍" },
  { href: "/admin/reviews", label: "Review queues", icon: "☑" },
  { href: "/admin/corpus", label: "HR corpus", icon: "§" },
  { href: "/admin/tickets", label: "HR tickets", icon: "✉" },
  { href: "/admin/reports", label: "Reports", icon: "∑" },
  { href: "/admin/integrity", label: "Integrity", icon: "◉" },
];

const MANAGER_NAV: NavItem[] = [
  { href: "/team", label: "My team", icon: "◍" },
  { href: "/team/reports", label: "Team reports", icon: "∑" },
];

const PALETTE = [
  ...ADMIN_NAV.map((n) => ({ label: n.label, href: n.href, group: "Admin" })),
  { label: "My team", href: "/team", group: "Manager" },
  { label: "Learner home", href: "/home", group: "Learner" },
];

/** The rail's collapsed state, so the server renders the right width with no flash. */
async function railCollapsed(): Promise<boolean> {
  return (await cookies()).get("ll_nav")?.value === "collapsed";
}

async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.notifications)
    .where(and(eq(t.notifications.userId, userId), isNull(t.notifications.readAt)));
  return row?.n ?? 0;
}

/** Opaque, hairline-bordered app bar — fixed 48px so `top-12` stickies line up beneath it. */
function Header({ user, unread, inboxHref }: { user: CurrentUser; unread: number; inboxHref: string }) {
  const ws = user.session.workspace;
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background px-4">
      <Link href={ws === "learner" ? "/home" : ws === "manager" ? "/team" : "/admin"} className="text-base font-medium">
        LuLu Learn
      </Link>
      <div className="flex-1" />
      {user.role !== "LEARNER" ? (
        <form action={switchWorkspace.bind(null, ws === "learner" ? (user.role === "ADMIN" ? "admin" : "manager") : "learner")}>
          <PillButton type="submit">{ws === "learner" ? "Switch to workspace" : "View as learner"}</PillButton>
        </form>
      ) : null}
      <Link
        href={inboxHref}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="pressable touch-target relative inline-flex items-center justify-center rounded-control px-2 text-base hover:bg-surface-2"
      >
        ◔
        {unread > 0 ? (
          <span className="absolute -end-1 top-1 rounded-full bg-destructive px-1 text-xs font-medium leading-4 text-destructive-fg">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </Link>
      <ThemeToggle />
      <form action={logout}>
        <button type="submit" className="pressable rounded-control px-2 py-1 text-xs text-muted hover:bg-surface-2">
          Sign out
        </button>
      </form>
    </header>
  );
}

export async function LearnerShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const [unread, flash, navCollapsed] = await Promise.all([unreadCount(user.id), readFlash(), railCollapsed()]);
  return (
    <ToastProvider initial={flash}>
      <div className="min-h-dvh">
        <Header user={user} unread={unread} inboxHref="/inbox" />
        <LearnerContainer>
          <LearnerTabs items={LEARNER_TABS} defaultCollapsed={navCollapsed} />
          <main className="learner-main min-w-0 flex-1 px-4 pt-6">{children}</main>
        </LearnerContainer>
      </div>
    </ToastProvider>
  );
}

export async function WorkspaceShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const [unread, flash, navCollapsed] = await Promise.all([unreadCount(user.id), readFlash(), railCollapsed()]);
  const nav = user.session.workspace === "admin" ? ADMIN_NAV : MANAGER_NAV;
  return (
    <ToastProvider initial={flash}>
      <div className="min-h-dvh">
        <Header user={user} unread={unread} inboxHref={user.session.workspace === "admin" ? "/admin/inbox" : "/team/inbox"} />
        <div className="flex">
          <SideNav items={nav} defaultCollapsed={navCollapsed} />
          {/* pt-12 on phones clears the fixed workspace nav strip */}
          <main className="min-w-0 flex-1 px-4 pb-6 pt-12 md:px-6 md:pt-6">
            <div className="mb-3 hidden justify-end md:flex">
              <Chip variant="neutral">⌘K to jump</Chip>
            </div>
            {children}
          </main>
        </div>
        <CommandPalette entries={user.session.workspace === "admin" ? PALETTE : PALETTE.filter((p) => p.group !== "Admin")} />
      </div>
    </ToastProvider>
  );
}
