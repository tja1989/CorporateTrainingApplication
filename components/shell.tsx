import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import { logout, switchWorkspace } from "@/lib/auth/login";
import { LearnerTabs, SideNav, type NavItem } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./palette";
import { Chip } from "./ui";

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
  { href: "/admin/banks", label: "Question banks", icon: "❖" },
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

async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.notifications)
    .where(and(eq(t.notifications.userId, userId), isNull(t.notifications.readAt)));
  return row?.n ?? 0;
}

function Header({ user, unread, inboxHref }: { user: CurrentUser; unread: number; inboxHref: string }) {
  const ws = user.session.workspace;
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-sm">
      <Link href={ws === "learner" ? "/home" : ws === "manager" ? "/team" : "/admin"} className="font-ai-voice text-lg font-semibold">
        LuLu Learn
      </Link>
      <div className="flex-1" />
      {user.role !== "LEARNER" ? (
        <form action={switchWorkspace.bind(null, ws === "learner" ? (user.role === "ADMIN" ? "admin" : "manager") : "learner")}>
          <button type="submit" className="pressable rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:bg-surface-2">
            {ws === "learner" ? "Switch to workspace" : "View as learner"}
          </button>
        </form>
      ) : null}
      <Link href={inboxHref} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="pressable touch-target relative rounded-[--radius-control] px-2 text-lg hover:bg-surface-2">
        ◔
        {unread > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-fg">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </Link>
      <ThemeToggle />
      <form action={logout}>
        <button type="submit" className="pressable rounded-[--radius-control] px-2 py-1 text-xs text-muted hover:bg-surface-2">
          Sign out
        </button>
      </form>
    </header>
  );
}

export async function LearnerShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const unread = await unreadCount(user.id);
  return (
    <div className="min-h-dvh">
      <Header user={user} unread={unread} inboxHref="/inbox" />
      <div className="mx-auto flex max-w-5xl">
        <LearnerTabs items={LEARNER_TABS} />
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:pb-10">{children}</main>
      </div>
    </div>
  );
}

export async function WorkspaceShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const unread = await unreadCount(user.id);
  const nav = user.session.workspace === "admin" ? ADMIN_NAV : MANAGER_NAV;
  return (
    <div className="min-h-dvh">
      <Header user={user} unread={unread} inboxHref={user.session.workspace === "admin" ? "/admin/inbox" : "/team/inbox"} />
      <div className="flex">
        <SideNav items={nav} />
        <main className="min-w-0 flex-1 px-6 py-6">
          <div className="mb-3 hidden justify-end md:flex">
            <Chip variant="neutral">⌘K to jump</Chip>
          </div>
          {children}
        </main>
      </div>
      <CommandPalette entries={user.session.workspace === "admin" ? PALETTE : PALETTE.filter((p) => p.group !== "Admin")} />
    </div>
  );
}
