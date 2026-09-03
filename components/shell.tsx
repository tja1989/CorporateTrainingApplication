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
import { Icon } from "./icons";
import { Brand } from "./brand";
import { Chip } from "./ui";

const LEARNER_TABS: NavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/learn", label: "Learn", icon: "book" },
  { href: "/drill", label: "Drill", icon: "target" },
  { href: "/ask-hr", label: "Ask HR", icon: "sparkle" },
  { href: "/profile", label: "Profile", icon: "user" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "grid" },
  { href: "/admin/courses", label: "Courses", icon: "book" },
  { href: "/admin/people", label: "People & rules", icon: "users" },
  { href: "/admin/reviews", label: "Review queues", icon: "check-square" },
  { href: "/admin/corpus", label: "HR corpus", icon: "file-text" },
  { href: "/admin/tickets", label: "HR tickets", icon: "mail" },
  { href: "/admin/reports", label: "Reports", icon: "chart" },
  { href: "/admin/integrity", label: "Integrity", icon: "shield" },
];

const MANAGER_NAV: NavItem[] = [
  { href: "/team", label: "My team", icon: "users" },
  { href: "/team/reports", label: "Team reports", icon: "chart" },
];

const PALETTE = [
  ...ADMIN_NAV.map((n) => ({ label: n.label, href: n.href, group: "Admin" })),
  { label: "My team", href: "/team", group: "Manager" },
  { label: "Learner home", href: "/home", group: "Learner" },
];

/**
 * The rail's pinned state, so the server renders the right width with no flash.
 * Collapsed is the default: the rail opens on hover, so the icons-only strip
 * costs nothing and hands ~10rem back to the content.
 */
async function railCollapsed(): Promise<boolean> {
  return (await cookies()).get("ll_nav")?.value !== "open";
}

async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.notifications)
    .where(and(eq(t.notifications.userId, userId), isNull(t.notifications.readAt)));
  return row?.n ?? 0;
}

/* Header controls live on the charcoal bar, so they carry their own idle/hover
   colours rather than the light-surface pill. */
const headerButton =
  "pressable touch-target inline-flex items-center justify-center gap-2 rounded-full text-rail-muted hover:bg-rail-hover hover:text-rail-fg";

/** Opaque charcoal app bar — fixed 48px so `top-12` stickies line up beneath it. */
function Header({ user, unread, inboxHref }: { user: CurrentUser; unread: number; inboxHref: string }) {
  const ws = user.session.workspace;
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 bg-rail px-4 text-rail-fg">
      <Brand href={ws === "learner" ? "/home" : ws === "manager" ? "/team" : "/admin"} />
      <div className="flex-1" />
      {user.role !== "LEARNER" ? (
        <form action={switchWorkspace.bind(null, ws === "learner" ? (user.role === "ADMIN" ? "admin" : "manager") : "learner")}>
          <button
            type="submit"
            className="pressable hit-area inline-flex items-center gap-1 rounded-full border border-rail-hover px-3 py-1 text-xs font-medium text-rail-fg hover:border-accent hover:text-accent"
          >
            <Icon name="swap" size={14} />
            <span className="hidden sm:inline">{ws === "learner" ? "Switch to workspace" : "View as learner"}</span>
            <span className="sm:hidden">{ws === "learner" ? "Workspace" : "Learner"}</span>
          </button>
        </form>
      ) : null}
      <Link href={inboxHref} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className={`${headerButton} relative px-2`}>
        <Icon name="bell" />
        {unread > 0 ? (
          <span className="animate-pop absolute -end-1 top-1 rounded-full bg-accent px-1 text-xs font-medium leading-4 text-accent-fg">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </Link>
      <ThemeToggle className={`${headerButton} px-2`} />
      <form action={logout}>
        <button type="submit" className={`${headerButton} px-3 text-xs`}>
          <Icon name="logout" size={16} />
          <span className="hidden sm:inline">Sign out</span>
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
        {/* Same frame as the workspace shell: rail at the start edge, content centred in what is left. */}
        <div className="shell-body flex">
          <LearnerTabs items={LEARNER_TABS} defaultCollapsed={navCollapsed} />
          <main className="learner-main min-w-0 flex-1 px-4 pt-6 md:px-6">
            <LearnerContainer>{children}</LearnerContainer>
          </main>
        </div>
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
        <div className="shell-body flex">
          <SideNav items={nav} defaultCollapsed={navCollapsed} />
          {/* pt-12 on phones clears the fixed workspace nav strip */}
          <main className="min-w-0 flex-1 px-4 pb-6 pt-12 md:px-6 md:pt-6">
            <div className="mb-3 hidden justify-end md:flex">
              <Chip variant="neutral">
                <Icon name="command" size={12} />K to jump
              </Chip>
            </div>
            {children}
          </main>
        </div>
        <CommandPalette entries={user.session.workspace === "admin" ? PALETTE : PALETTE.filter((p) => p.group !== "Admin")} />
      </div>
    </ToastProvider>
  );
}
