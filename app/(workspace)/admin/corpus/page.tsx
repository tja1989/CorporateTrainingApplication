import { Markdown } from "@/lib/markdown";
import { WorkspaceTabs, WorkspaceLink } from "@/components/workspace-ui";
import { WorkspaceForm } from "@/components/workspace-form";
import { desc, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Card, Chip, PageTitle, DemoBanner, Button, Field, Input, Select, Textarea, Tile } from "@/components/ui";
import { publishPolicyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CorpusPage({ searchParams }: { searchParams: Promise<{ view?: string; doc?: string }> }) {
  const { view: viewParam, doc: docId } = await searchParams;
  const view = viewParam === "publish" || viewParam === "quality" ? viewParam : "documents";
  await requireRole("ADMIN");
  const docs = await db.select().from(t.policyDocs).orderBy(desc(t.policyDocs.effectiveDate));

  // KPI dashboard (spec FR-8.12)
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      escalated: sql<number>`count(*) FILTER (WHERE escalated)::int`,
      up: sql<number>`count(*) FILTER (WHERE feedback = 'up')::int`,
      down: sql<number>`count(*) FILTER (WHERE feedback = 'down')::int`,
      abstained: sql<number>`count(*) FILTER (WHERE answer LIKE '%couldn''t find%' OR answer LIKE '%can''t find%')::int`,
      guardrailed: sql<number>`count(*) FILTER (WHERE guardrail IS NOT NULL)::int`,
    })
    .from(t.hrAuditLog);
  const total = totals?.total ?? 0;
  const deflection = total === 0 ? 0 : Math.round(((total - (totals?.escalated ?? 0)) / total) * 100);
  const csat = (totals?.up ?? 0) + (totals?.down ?? 0);

  const unanswered = await db
    .select({ query: t.hrAuditLog.query, ts: t.hrAuditLog.ts })
    .from(t.hrAuditLog)
    .where(sql`answer LIKE '%couldn''t find%' OR answer LIKE '%can''t find%'`)
    .orderBy(desc(t.hrAuditLog.ts))
    .limit(10);

  return (
    <div className="animate-slide-up">
      <DemoBanner />
      <PageTitle sub="Policy documents, versions, and assistant quality.">HR corpus</PageTitle>

      <WorkspaceTabs label="HR corpus views" items={[{ href: "/admin/corpus", label: "Policies", active: view === "documents" }, { href: "/admin/corpus?view=publish", label: "Publish a version", active: view === "publish" }, { href: "/admin/corpus?view=quality", label: "Assistant quality", active: view === "quality" }]} />
      <div className="max-w-5xl">
        {view === "documents" ? <section aria-label="Documents">
          <h2 className="eyebrow mb-2 text-muted">Documents</h2>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><nav aria-label="Policy versions" className="flex flex-col gap-2">
            {docs.map((doc) => (
              <a key={doc.id} href={`/admin/corpus?doc=${doc.id}`} aria-current={doc.id === (docId ?? docs[0]?.id) ? "page" : undefined} className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-border bg-surface p-4 text-sm hover:bg-surface-2 aria-[current]:border-primary">
                <div className="min-w-0">
                  <p className="break-words font-medium text-link">{doc.title}</p>
                  <p className="text-xs text-muted">
                    {doc.country} · v{doc.version} · effective {doc.effectiveDate.toISOString().slice(0, 10)} · {doc.audience}
                    {doc.owner ? ` · owner: ${doc.owner}` : ""}
                  </p>
                </div>
                <Chip variant={doc.status === "ACTIVE" ? "success" : "neutral"}>{doc.status.toLowerCase()}</Chip>
              </a>
            ))}
          </nav><article className="min-w-0 rounded-card border border-border bg-surface p-4 sm:p-6">{(() => { const doc = docs.find(d => d.id === (docId ?? docs[0]?.id)); return doc ? <><h2 className="mb-2 text-lg font-semibold">{doc.title}</h2><p className="mb-4 text-sm text-muted">Version {doc.version} · {doc.status.toLowerCase()} · {doc.country} · {doc.audience}</p><Markdown text={doc.body} headingOffset={1} /></> : <p className="text-muted">Select a policy version to read its content, or publish your first policy.</p>; })()}</article></div>

        </section> : null}
        {view === "quality" ? <section aria-label="Assistant quality">      <div className="mb-6 grid max-w-4xl gap-3 sm:grid-cols-4">
        <Tile value={deflection} suffix="%" label="Deflection (resolved w/o human)" hint="Exchanges without escalation; this does not establish answer correctness." />
        <Tile value={totals?.escalated ?? 0} label={`Escalations of ${total} exchanges`} />
        <Tile value={csat === 0 ? "—" : Math.round(((totals?.up ?? 0) / csat) * 100)} suffix={csat === 0 ? undefined : "%"} label={`CSAT (${csat} rated)`} />
        <Tile value={totals?.abstained ?? 0} label="Abstentions (content gaps)" tone={(totals?.abstained ?? 0) > 0 ? "warning" : "default"} />
      </div>

          <WorkspaceLink href="/admin/tickets" className="mb-4">Review HR tickets</WorkspaceLink>
          <h2 className="mb-2 mt-6 text-sm font-medium text-muted">Top unanswered questions (content-gap feed)</h2>
          {unanswered.length === 0 ? (
            <p className="text-sm text-muted">No abstentions yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {unanswered.map((u, i) => (
                <li key={i} className="rounded-control bg-surface-2 px-3 py-1">{u.query}</li>
              ))}
            </ul>
          )}
        </section> : null}

        {view === "publish" ? <section aria-label="Publish new version" className="max-w-3xl">
          <h2 className="eyebrow mb-2 text-muted">Publish a policy version</h2>
          <Card className="p-4">
            <WorkspaceForm action={publishPolicyAction}>
              <Field label="Title" hint="Publishing with an existing title supersedes the old version (its chunks are flagged, never deleted).">
                <Input name="title" required placeholder="e.g. Leave & Time Off Policy" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Country"><Input name="country" defaultValue="AE" required /></Field>
                <Field label="Audience">
                  <Select name="audience" defaultValue="all">
                    <option value="all">All employees</option>
                    <option value="managers">Managers only</option>
                  </Select>
                </Field>
              </div>
              <Field label="Policy owner"><Input name="owner" placeholder="e.g. Head of HR Operations" /></Field>
              <Field label="Effective date"><Input name="effectiveDate" type="date" required /></Field>
              <Field label="Document (markdown)" hint="Use # and ## headings — chunking follows them, keeping rules with their exceptions.">
                <Textarea name="body" rows={10} required placeholder={"# Policy name\n\n## Section\nPolicy text…"} />
              </Field>
              <Button type="submit">Publish & ingest</Button>
            </WorkspaceForm>
          </Card>
        </section> : null}
      </div>
    </div>
  );
}
