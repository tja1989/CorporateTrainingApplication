import { and, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole, teamOf } from "@/lib/auth/guard";
import { Button, Chip, PageHeader, EmptyState, Field, Input, Select, cx } from "@/components/ui";
import { WorkspaceLink } from "@/components/workspace-ui";
export const dynamic = "force-dynamic";
const FILTERS = [
  { key: "OVERDUE", label: "Overdue", unit: "assignments" },
  { key: "DUE_SOON", label: "Due soon", unit: "assignments" },
  { key: "IN_PROGRESS", label: "In progress", unit: "assignments" },
  { key: "COMPLETED", label: "Completed", unit: "assignments" },
  { key: "COMPLETED_EXPIRING", label: "Expiring certificates", unit: "assignments" },
  { key: "INACTIVE", label: "Inactive for 30 days", unit: "people" },
];
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const manager = await requireRole("MANAGER", "ADMIN");
  const { filter = "", q = "" } = await searchParams;
  const team = (await teamOf(manager.id)).filter(u => !u.erasedAt);
  const ids = team.map(u => u.id);
  const enrollments = ids.length ? await db.select().from(t.enrollments).where(inArray(t.enrollments.userId, ids)) : [];
  const recent = ids.length ? await db.select({ userId: t.uiEvents.userId }).from(t.uiEvents).where(and(inArray(t.uiEvents.userId, ids), sql`ts > now() - interval '30 days'`)) : [];
  const active = new Set(recent.map(e => e.userId));
  const itemsOf = (id: string) => enrollments.filter(e => e.userId === id && e.status !== "WITHDRAWN");
  const matches = (id: string, status: string) => status === "INACTIVE" ? !active.has(id) : itemsOf(id).some(e => status === "IN_PROGRESS" ? e.status === status : e.complianceStatus === status);
  const countOf = (status: string) => status === "INACTIVE" ? team.filter(u => !active.has(u.id)).length : enrollments.filter(e => e.status !== "WITHDRAWN" && (status === "IN_PROGRESS" ? e.status === status : e.complianceStatus === status)).length;
  const filtered = team.filter(u => (!filter || matches(u.id, filter)) && `${u.name} ${u.employeeId} ${u.jobTitle ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a,b) => countUrgent(b.id) - countUrgent(a.id) || a.name.localeCompare(b.name));
  function countUrgent(id: string) { return itemsOf(id).reduce((n,e) => n + (e.complianceStatus === "OVERDUE" ? 100 : e.complianceStatus === "DUE_SOON" ? 1 : 0),0); }
  return <div>
    <PageHeader title="My team" sub={`${team.length} direct report${team.length === 1 ? "" : "s"}. Start with the people whose training needs attention.`} actions={<WorkspaceLink href="/team/reports">View team reports</WorkspaceLink>} />
    {!team.length ? <EmptyState title="No direct reports" body="Employees assigned to you as manager will appear here. Your reports will remain empty until then." /> : <>
      <section aria-label="Team status" className="mb-6 grid grid-cols-2 overflow-hidden rounded-card border border-border bg-surface md:grid-cols-3 xl:grid-cols-6">{FILTERS.map(f => <a key={f.key} href={`/team?${new URLSearchParams({ ...(q ? { q } : {}), ...(filter !== f.key ? { filter: f.key } : {}) })}`} aria-current={filter === f.key ? "page" : undefined} className={cx("touch-target border-b border-border p-4 hover:bg-surface-2", filter === f.key && "bg-accent-tint")}><span className="block text-sm text-muted">{f.label}</span><span className={cx("mt-1 block text-xl font-semibold", f.key === "OVERDUE" && countOf(f.key) > 0 && "text-destructive-text")}>{countOf(f.key)} <span className="text-sm font-normal text-muted">{f.unit}</span></span></a>)}</section>
      <form action="/team" method="get" className="mb-4 grid items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"><Field label="Search team"><Input name="q" defaultValue={q} placeholder="Name, employee ID or job title" /></Field><Field label="Training status"><Select name="filter" defaultValue={filter}><option value="">All team members</option>{FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</Select></Field><div className="mb-4 flex gap-2"><Button type="submit">Apply</Button>{q || filter ? <WorkspaceLink href="/team">Reset</WorkspaceLink> : null}</div></form>
      <p className="mb-3 text-sm text-muted">{filtered.length} of {team.length} people · overdue training first</p>
      <div className="rounded-card border border-border bg-surface">
        <table role="table" className="block w-full table-fixed md:table">
          <caption className="sr-only">Team learning and training status</caption>
          <thead className="hidden border-b border-border bg-surface-2 text-sm md:table-header-group"><tr><th className="w-[35%] px-4 py-3 text-start">Team member</th><th className="px-4 py-3 text-start">Learning</th><th className="px-4 py-3 text-start">Due training</th><th className="px-4 py-3 text-start">Contact</th></tr></thead>
          <tbody className="block md:table-row-group">{filtered.map(member => {
            const items = itemsOf(member.id);
            const overdue = items.filter(e => e.complianceStatus === "OVERDUE").length;
            const soon = items.filter(e => e.complianceStatus === "DUE_SOON").length;
            const cell = "block min-w-0 text-sm md:table-cell md:px-4 md:py-4";
            return <tr key={member.id} className="grid gap-3 border-b border-border p-4 last:border-0 hover:bg-surface-2 md:table-row md:p-0">
              <td className={cell}><a href={`/team/${member.id}`} className="touch-target inline-flex items-center break-words font-semibold text-link underline">{member.name}</a><p className="break-words text-sm text-muted">{member.employeeId} · {member.jobTitle ?? "Employee"}</p></td>
              <td className={cell}>{items.length} assignments <span className="text-muted">· {items.filter(e => e.status === "COMPLETED").length} completed</span></td>
              <td className={cell}><div className="flex flex-wrap gap-2">{overdue ? <Chip variant="destructive">{overdue} overdue</Chip> : null}{soon ? <Chip variant="warning">{soon} due soon</Chip> : null}{!overdue && !soon ? <Chip variant="success">On track</Chip> : null}</div></td>
              <td className={cell}><span className="text-muted">{!member.email && !active.has(member.id) ? "Nudge in person" : member.email ? "Email and in-app" : "In-app"}</span></td>
            </tr>;
          })}</tbody>
        </table>
        {!filtered.length ? <p className="p-6 text-sm text-muted">No team members match. Reset your filters to see everyone.</p> : null}
      </div>
    </>}
  </div>;
}
