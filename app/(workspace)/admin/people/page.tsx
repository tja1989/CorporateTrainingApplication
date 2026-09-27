import { WorkspaceTabs, WorkspaceLink } from "@/components/workspace-ui";
import { WorkspaceForm } from "@/components/workspace-form";
import { PeopleEditorList } from "./people-editor";
import { Icon } from "@/components/icons";
import { asc } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Button, Card, Chip, Field, Input, PageHeader, Select, SectionTitle, Textarea } from "@/components/ui";
import { importCsvAction, createRuleAction, toggleRuleAction, createGroupAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; page?: string }> }) {
  await requireRole("ADMIN");
  const { q, view: viewParam, page: pageParam } = await searchParams;
  const view = ["import", "groups", "rules"].includes(viewParam ?? "") ? viewParam! : "people";
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
  const targetName = (r: typeof rules[number]) =>
    r.targetType === "course" ? courses.find((c) => c.id === r.targetId)?.title : paths.find((p) => p.id === r.targetId)?.title;

  return (
    <div className="animate-slide-up">
      <PageHeader title="People" sub="Manage employees, import new starters, and keep required learning aligned with their roles." />

      <WorkspaceTabs label="People management" items={["people", "import", "groups", "rules"].map(v => ({ href: `/admin/people?view=${v}`, label: v === "people" ? "People" : v === "import" ? "CSV import" : v === "groups" ? "Groups" : "Enrollment rules", active: view === v }))} />
      {/* minmax(0,…) rather than a bare fr: the rule form's <select>s carry whole
          course titles, and an auto-minimum track would rather push the page
          sideways than let one shrink. */}
      <div className="max-w-4xl">
        {view === "people" ? <section aria-label="Users">
          <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/people" method="get">
            <div className="min-w-0 flex-1"><Field label="Search people"><Input name="q" defaultValue={q ?? ""} placeholder="Name or employee ID" /></Field></div><Button type="submit" className="mb-4">Search</Button>{q ? <WorkspaceLink href="/admin/people" className="mb-4">Reset</WorkspaceLink> : null}
          </form>
          <PeopleEditorList
            people={visible.map(user => ({
              id: user.id, employeeId: user.employeeId, name: user.name,
              role: user.role, passwordState: user.passwordState, jobTitle: user.jobTitle,
              managerId: user.managerId, storeId: user.storeId,
              groupId: user.groupIds[0] ?? null, timeMultiplier: user.timeMultiplier,
            }))}
            managers={managers.map(({ id, name }) => ({ id, name }))}
            stores={stores.map(({ id, name }) => ({ id, name }))}
            groups={groups.map(({ id, name }) => ({ id, name }))}
          />
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {filtered.length === 0 ? "0" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)}`} of {filtered.length}
            </span>
            <span className="flex gap-2">
              {page > 1 ? <WorkspaceLink href={pageHref(page - 1)}>Previous</WorkspaceLink> : null}
              {page < pages ? <WorkspaceLink href={pageHref(page + 1)}>Next</WorkspaceLink> : null}
            </span>
          </div>
        </section> : null}

        <div className="flex flex-col gap-6">
          {view === "import" ? <Card className="p-4 sm:p-6" aria-label="Import">
            <SectionTitle>CSV import</SectionTitle>
            <p className="mb-4 text-sm text-muted">Import valid rows and review errors by row number. Existing employees are skipped. Activation codes appear here once after import.</p><WorkspaceForm action={importCsvAction} reload={false}>
              <Field label="Rows" hint="employeeId,name,role,storeName,groupName,jobTitle,hireDate(YYYY-MM-DD),managerEmployeeId">
                <Textarea name="csv" rows={5} placeholder={"AE10150,Asha Kumar,LEARNER,Barsha Hypermarket,Cashier,Cashier,2026-05-01,AE20002"} required />
              </Field>
              <Button type="submit">Import employees</Button>
            </WorkspaceForm>
          </Card> : null}

          {view === "rules" ? <Card className="p-4 sm:p-6" aria-label="Rules">
            <SectionTitle>Auto-enrollment rules</SectionTitle>
            <ul className="mb-3 flex flex-col gap-2 text-sm">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-control bg-surface-2 px-3 py-2">
                  <span className="min-w-0 break-words">
                    {r.name} <span className="text-xs text-muted"><Icon name="arrow-right" size={12} className="inline align-text-bottom" /> {targetName(r) ?? r.targetId}{r.criteria.groupId ? ` · group ${groupName.get(r.criteria.groupId)}` : ""}</span>
                  </span>
                  <WorkspaceForm action={toggleRuleAction.bind(null, r.id)}>
                    <button className="link hit-area text-xs text-link">{r.active ? "disable" : "enable"}</button>
                  </WorkspaceForm>
                </li>
              ))}
            </ul>
            <WorkspaceForm action={createRuleAction}><div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rule name"><Input name="name" required /></Field>
              <Field label="Target">
                <Select name="target" required>
                  <optgroup label="Courses">
                    {courses.map((c) => (
                      <option key={c.id} value={`course:${c.id}`}>Course · {c.title}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Paths">
                    {paths.map((p) => (
                      <option key={p.id} value={`path:${p.id}`}>Path · {p.title}</option>
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
              <Field label="Due days from enrollment"><Input name="dueDays" type="number" min={1} max={3650} defaultValue={14} /></Field>
              <div className="flex items-end pb-4"><Button type="submit">Create & apply</Button></div>
            </div></WorkspaceForm>
            <p className="text-sm text-muted">Rules re-evaluate automatically on user changes; creating one applies it to everyone matching now.</p>
          </Card> : null}

          {view === "groups" ? <Card className="p-4 sm:p-6" aria-label="Groups">
            <SectionTitle>Groups (job families)</SectionTitle>
            <div className="mb-2 flex flex-wrap gap-2">
              {groups.map((g) => (
                <Chip key={g.id} variant="neutral">{g.name}</Chip>
              ))}
            </div>
            <WorkspaceForm action={createGroupAction}>
              <Field label="New group"><Input name="name" required /></Field>
              <Button type="submit" variant="secondary" className="mb-4">Add</Button>
            </WorkspaceForm>
          </Card> : null}
        </div>
      </div>
    </div>
  );
}
