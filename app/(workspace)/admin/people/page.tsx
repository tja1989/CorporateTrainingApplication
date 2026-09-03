import { Icon } from "@/components/icons";
import { asc } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Button, ButtonLink, Card, Chip, Field, Input, PageHeader, Select, SectionTitle, Textarea } from "@/components/ui";
import { importCsvAction, createRuleAction, toggleRuleAction, updateUserAction, issueCodeAction, createGroupAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; codes?: string; page?: string }> }) {
  await requireRole("ADMIN");
  const { q, codes, page: pageParam } = await searchParams;
  const users = await db.select().from(t.users).orderBy(asc(t.users.employeeId));
  const filtered = q
    ? users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()) || u.employeeId.toLowerCase().includes(q.toLowerCase()))
    : users;
  // The list flows in the page and paginates — never an inner scroll region (spec §10.7 v1.2)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(pageParam) || 1));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (n: number) => `/admin/people?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) }).toString()}`;

  const stores = (await db.select().from(t.orgUnits)).filter((o) => o.type === "store");
  const groups = await db.select().from(t.groups);
  const rules = await db.select().from(t.enrollmentRules);
  const courses = await db.select().from(t.courses);
  const paths = await db.select().from(t.paths);
  const managers = users.filter((u) => u.role !== "LEARNER");
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const targetName = (r: typeof rules[number]) =>
    r.targetType === "course" ? courses.find((c) => c.id === r.targetId)?.title : paths.find((p) => p.id === r.targetId)?.title;

  return (
    <div className="animate-slide-up">
      <PageHeader title="People & rules" sub="Users, groups, and auto-enrollment rules." />

      {codes ? (
        <Card className="mb-4 max-w-3xl border-accent bg-accent-tint p-4">
          <h2 className="mb-1 text-sm font-medium">Activation codes for imported users — shown once</h2>
          <pre className="overflow-x-auto rounded-control bg-surface-2 p-2 text-sm">{decodeURIComponent(codes)}</pre>
        </Card>
      ) : null}

      {/* minmax(0,…) rather than a bare fr: the rule form's <select>s carry whole
          course titles, and an auto-minimum track would rather push the page
          sideways than let one shrink. */}
      <div className="grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-label="Users">
          <form className="mb-3" action="/admin/people" method="get">
            <Input name="q" defaultValue={q ?? ""} placeholder="Search by name or employee ID…" aria-label="Search users" />
          </form>
          <div className="flex flex-col gap-2">
            {visible.map((u) => (
              <details key={u.id} className="rounded-card border border-border bg-surface">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{u.name}</span>
                    <span className="ms-2 text-xs text-muted">{u.employeeId} · {u.jobTitle ?? "—"} · {u.storeId ? storeName.get(u.storeId) : "—"}</span>
                  </span>
                  <span className="flex gap-2">
                    <Chip variant={u.role === "ADMIN" ? "primary" : u.role === "MANAGER" ? "warning" : "neutral"}>{u.role.toLowerCase()}</Chip>
                    {u.passwordState === "INVITED" ? <Chip variant="warning">invited</Chip> : null}
                  </span>
                </summary>
                <div className="border-t border-border p-3">
                  <form action={updateUserAction.bind(null, u.id)} className="grid grid-cols-2 gap-3">
                    <Field label="Role">
                      <Select name="role" defaultValue={u.role}>
                        <option>LEARNER</option><option>MANAGER</option><option>ADMIN</option>
                      </Select>
                    </Field>
                    <Field label="Manager">
                      <Select name="managerId" defaultValue={u.managerId ?? ""}>
                        <option value="">— none —</option>
                        {managers.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Store">
                      <Select name="storeId" defaultValue={u.storeId ?? ""}>
                        <option value="">— none —</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Group">
                      <Select name="groupId" defaultValue={u.groupIds[0] ?? ""}>
                        <option value="">— none —</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Time multiplier (assessment accommodation)">
                      <Select name="timeMultiplier" defaultValue={String(u.timeMultiplier)}>
                        <option value="1">1× (standard)</option>
                        <option value="1.5">1.5×</option>
                        <option value="2">2×</option>
                      </Select>
                    </Field>
                    <div className="flex items-end gap-2 pb-4">
                      <Button type="submit" variant="secondary">Save</Button>
                    </div>
                  </form>
                  <form action={issueCodeAction.bind(null, u.id)}>
                    <Button type="submit" variant="ghost">Issue reset/activation code</Button>
                  </form>
                </div>
              </details>
            ))}
            {visible.length === 0 ? <p className="text-sm text-muted">No one matches this search.</p> : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {filtered.length === 0 ? "0" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)}`} of {filtered.length}
            </span>
            <span className="flex gap-2">
              {page > 1 ? <ButtonLink variant="secondary" href={pageHref(page - 1)}>Previous</ButtonLink> : null}
              {page < pages ? <ButtonLink variant="secondary" href={pageHref(page + 1)}>Next</ButtonLink> : null}
            </span>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <Card className="p-4" aria-label="Import">
            <SectionTitle>CSV import</SectionTitle>
            <form action={importCsvAction}>
              <Field label="Rows" hint="employeeId,name,role,storeName,groupName,jobTitle,hireDate(YYYY-MM-DD),managerEmployeeId">
                <Textarea name="csv" rows={5} placeholder={"AE10150,Asha Kumar,LEARNER,Barsha Hypermarket,Cashier,Cashier,2026-05-01,AE20002"} required />
              </Field>
              <Button type="submit">Import (dry rows are skipped with errors shown)</Button>
            </form>
          </Card>

          <Card className="p-4" aria-label="Rules">
            <SectionTitle>Auto-enrollment rules</SectionTitle>
            <ul className="mb-3 flex flex-col gap-2 text-sm">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-control bg-surface-2 px-3 py-2">
                  <span className="min-w-0 truncate">
                    {r.name} <span className="text-xs text-muted"><Icon name="arrow-right" size={12} className="inline align-text-bottom" /> {targetName(r) ?? r.targetId}{r.criteria.groupId ? ` · group ${groupName.get(r.criteria.groupId)}` : ""}</span>
                  </span>
                  <form action={toggleRuleAction.bind(null, r.id)}>
                    <button className="link hit-area text-xs text-link">{r.active ? "disable" : "enable"}</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={createRuleAction} className="grid grid-cols-2 gap-3">
              <Field label="Rule name"><Input name="name" required /></Field>
              <Field label="Target">
                <Select name="target" required>
                  <optgroup label="Courses">
                    {courses.map((c) => (
                      <option key={c.id} value={`course:${c.id}`}>{c.title}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Paths">
                    {paths.map((p) => (
                      <option key={p.id} value={`path:${p.id}`}>{p.title}</option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
              <Field label="Group (criteria)">
                <Select name="groupId" defaultValue="">
                  <option value="">any</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Store (criteria)">
                <Select name="storeId" defaultValue="">
                  <option value="">any</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Due days from enrollment"><Input name="dueDays" type="number" defaultValue={14} /></Field>
              <div className="flex items-end pb-4"><Button type="submit">Create & apply</Button></div>
            </form>
            <p className="text-xs text-muted">Rules re-evaluate automatically on user changes; creating one applies it to everyone matching now.</p>
          </Card>

          <Card className="p-4" aria-label="Groups">
            <SectionTitle>Groups (job families)</SectionTitle>
            <div className="mb-2 flex flex-wrap gap-2">
              {groups.map((g) => (
                <Chip key={g.id} variant="neutral">{g.name}</Chip>
              ))}
            </div>
            <form action={createGroupAction} className="flex items-end gap-2">
              <Field label="New group"><Input name="name" required /></Field>
              <Button type="submit" variant="secondary" className="mb-4">Add</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
