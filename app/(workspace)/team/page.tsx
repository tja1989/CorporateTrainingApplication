import { and, gte, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { trainingScope } from "@/lib/auth/scope";
import { requireRole, teamOf } from "@/lib/auth/guard";
import {
  Button,
  Chip,
  PageHeader,
  EmptyState,
  Field,
  Input,
  Select,
  cx,
} from "@/components/ui";
import { WorkspaceLink } from "@/components/workspace-ui";
import { noun, plural } from "@/lib/format";
import { nudgeAction } from "./actions";
import { WorkspaceForm } from "@/components/workspace-form";
import { NUDGE_WINDOW_MS, nudgeKey } from "@/lib/nudge";
export const dynamic = "force-dynamic";
const FILTERS = [
  { key: "OVERDUE", label: "Overdue", unit: ["assignment", "assignments"] },
  { key: "DUE_SOON", label: "Due soon", unit: ["assignment", "assignments"] },
  { key: "IN_PROGRESS", label: "In progress", unit: ["assignment", "assignments"] },
  { key: "COMPLETED", label: "Completed", unit: ["assignment", "assignments"] },
  {
    key: "COMPLETED_EXPIRING",
    label: "Expiring certificates",
    unit: ["assignment", "assignments"],
  },
  { key: "INACTIVE", label: "Inactive for 30 days", unit: ["person", "people"] },
];
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const manager = await requireRole("MANAGER", "ADMIN");
  const { filter = "", q = "" } = await searchParams;
  const scope = await trainingScope(manager);
  const team = (
    manager.role === "DEPARTMENT_HEAD"
      ? await db
          .select()
          .from(t.users)
          .where(
            scope.userIds?.length
              ? inArray(t.users.id, scope.userIds)
              : sql`false`,
          )
      : await teamOf(manager.id)
  ).filter((u) => !u.erasedAt);
  const ids = team.map((u) => u.id);
  const enrollments = ids.length
    ? await db
        .select()
        .from(t.enrollments)
        .where(inArray(t.enrollments.userId, ids))
    : [];
  const recent = ids.length
    ? await db
        .select({ userId: t.uiEvents.userId })
        .from(t.uiEvents)
        .where(
          and(
            inArray(t.uiEvents.userId, ids),
            sql`ts > now() - interval '30 days'`,
          ),
        )
    : [];
  const active = new Set(recent.map((e) => e.userId));
  const nudged = new Set(
    (ids.length
      ? await db
          .select({ userId: t.notifications.userId })
          .from(t.notifications)
          .where(
            and(
              inArray(t.notifications.dedupeKey, ids.map(nudgeKey)),
              gte(t.notifications.sentAt, new Date(Date.now() - NUDGE_WINDOW_MS)),
            ),
          )
      : []
    ).map((n) => n.userId),
  );
  const itemsOf = (id: string) =>
    enrollments.filter((e) => e.userId === id && e.status !== "WITHDRAWN");
  const matches = (id: string, status: string) =>
    status === "INACTIVE"
      ? !active.has(id)
      : itemsOf(id).some((e) =>
          status === "IN_PROGRESS"
            ? e.status === status
            : e.complianceStatus === status,
        );
  const countOf = (status: string) =>
    status === "INACTIVE"
      ? team.filter((u) => !active.has(u.id)).length
      : enrollments.filter(
          (e) =>
            e.status !== "WITHDRAWN" &&
            (status === "IN_PROGRESS"
              ? e.status === status
              : e.complianceStatus === status),
        ).length;
  const filtered = team
    .filter(
      (u) =>
        (!filter || matches(u.id, filter)) &&
        `${u.name} ${u.employeeId} ${u.jobTitle ?? ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        countUrgent(b.id) - countUrgent(a.id) || a.name.localeCompare(b.name),
    );
  function countUrgent(id: string) {
    return itemsOf(id).reduce(
      (n, e) =>
        n +
        (e.complianceStatus === "OVERDUE"
          ? 100
          : e.complianceStatus === "DUE_SOON"
            ? 1
            : 0),
      0,
    );
  }
  return (
    <div>
      <PageHeader
        title="My team"
        sub={`${plural(team.length, "department employee")}. Start with the people whose training needs attention.`}
        actions={
          <WorkspaceLink href={manager.role === "DEPARTMENT_HEAD" ? "/department/reports" : "/team/reports"}>View team reports</WorkspaceLink>
        }
      />
      {!team.length ? (
        <EmptyState
          title="No department employees"
          body="Employees assigned to you as manager will appear here. Your reports will remain empty until then."
        />
      ) : (
        <>
          <section
            aria-label="Team status"
            className="mb-6 grid grid-cols-2 overflow-hidden rounded-card border border-border bg-surface md:grid-cols-3 xl:grid-cols-6"
          >
            {FILTERS.map((f) => (
              <a
                key={f.key}
                href={`/team?${new URLSearchParams({ ...(q ? { q } : {}), ...(filter !== f.key ? { filter: f.key } : {}) })}`}
                aria-current={filter === f.key ? "page" : undefined}
                className={cx(
                  "touch-target border-b border-border p-4 hover:bg-surface-2",
                  filter === f.key && "bg-surface-2 shadow-[inset_0_-3px_0_var(--primary)]",
                )}
              >
                <span className="block text-sm text-muted">{f.label}</span>
                <span
                  className={cx(
                    "type-number mt-1 block text-2xl",
                    f.key === "OVERDUE" && countOf(f.key) > 0 && "text-destructive-text",
                    f.key === "DUE_SOON" && countOf(f.key) > 0 && "text-warning-fg",
                  )}
                >
                  {countOf(f.key)}{" "}
                  <span className="text-sm font-normal text-muted">
                    {noun(countOf(f.key), f.unit[0], f.unit[1])}
                  </span>
                </span>
              </a>
            ))}
          </section>
          <form
            action="/team"
            method="get"
            className="mb-4 grid items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
          >
            <Field label="Search team">
              <Input
                name="q"
                defaultValue={q}
                placeholder="Name, employee ID or job title"
              />
            </Field>
            <Field label="Training status">
              <Select name="filter" defaultValue={filter}>
                <option value="">All team members</option>
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="mb-4 flex gap-2">
              <Button type="submit" variant="secondary">Apply</Button>
              {q || filter ? (
                <WorkspaceLink href="/team">Reset</WorkspaceLink>
              ) : null}
            </div>
          </form>
          <p className="mb-3 text-sm text-muted">
            {filtered.length} of {plural(team.length, "person", "people")}, overdue training first
          </p>
          <div className="rounded-card border border-border bg-surface">
            <table role="table" className="block w-full table-fixed md:table">
              <caption className="sr-only">
                Team learning and training status
              </caption>
              <thead className="hidden border-b border-border bg-surface-2 text-sm md:table-header-group">
                <tr>
                  <th className="w-[35%] px-4 py-3 text-start">Team member</th>
                  <th className="px-4 py-3 text-start">Learning</th>
                  <th className="px-4 py-3 text-start">Due training</th>
                  <th className="px-4 py-3 text-start"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {filtered.map((member) => {
                  const items = itemsOf(member.id);
                  const overdue = items.filter(
                    (e) => e.complianceStatus === "OVERDUE",
                  ).length;
                  const soon = items.filter(
                    (e) => e.complianceStatus === "DUE_SOON",
                  ).length;
                  const cell =
                    "block min-w-0 text-sm md:table-cell md:px-4 md:py-3 md:align-middle";
                  return (
                    <tr
                      key={member.id}
                      className="grid gap-3 border-b border-border p-4 last:border-0 hover:bg-surface-2 md:table-row md:p-0"
                    >
                      <td className={cell}>
                        <div className="flex items-center gap-3">
                          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-foreground">
                            {member.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <a
                              href={`/team/${member.id}`}
                              className="touch-target -my-2 inline-flex items-center break-words font-medium text-foreground hover:underline"
                            >
                              {member.name}
                            </a>
                            <p className="break-words text-sm text-muted">
                              {member.jobTitle ?? "Employee"}, {member.employeeId}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={cell}>
                        {plural(items.length, "assignment")}
                        <span className="text-muted">
                          , {items.filter((e) => e.status === "COMPLETED").length} completed
                        </span>
                      </td>
                      <td className={cell}>
                        <div className="flex flex-wrap gap-2">
                          {overdue ? (
                            <Chip variant="destructive">{overdue} overdue</Chip>
                          ) : null}
                          {soon ? (
                            <Chip variant="warning">{soon} due soon</Chip>
                          ) : null}
                          {!overdue && !soon ? (
                            <Chip variant="neutral">On track</Chip>
                          ) : null}
                        </div>
                      </td>
                      <td className={cx(cell, "md:text-end")}>
                        {overdue || soon ? (
                          <WorkspaceForm action={nudgeAction.bind(null, member.id)}>
                            <div className="inline-flex flex-col items-start gap-1 md:items-end">
                              <Button type="submit" variant="secondary" disabled={nudged.has(member.id)}>
                                {nudged.has(member.id) ? "Reminded in the last 48h" : "Send reminder"}
                              </Button>
                              <span className="text-xs text-muted">
                                {member.email ? "Email and in-app" : active.has(member.id) ? "In-app" : "In-app; mention it in person too"}
                              </span>
                            </div>
                          </WorkspaceForm>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="p-6 text-sm text-muted">
                No team members match. Reset your filters to see everyone.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
