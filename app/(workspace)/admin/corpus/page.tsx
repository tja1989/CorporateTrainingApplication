import { desc, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Card, Chip, PageTitle, DemoBanner, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { publishPolicyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CorpusPage() {
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

      <div className="mb-6 grid max-w-4xl gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-2xl font-semibold">{deflection}%</p><p className="text-xs text-muted">Deflection (resolved w/o human) · benchmark 20–40% typical, 65–75% good</p></Card>
        <Card className="p-4"><p className="text-2xl font-semibold">{totals?.escalated ?? 0}</p><p className="text-xs text-muted">Escalations of {total} exchanges</p></Card>
        <Card className="p-4"><p className="text-2xl font-semibold">{csat === 0 ? "—" : `${Math.round(((totals?.up ?? 0) / csat) * 100)}%`}</p><p className="text-xs text-muted">CSAT ({csat} rated)</p></Card>
        <Card className="p-4"><p className="text-2xl font-semibold">{totals?.abstained ?? 0}</p><p className="text-xs text-muted">Abstentions (content gaps)</p></Card>
      </div>

      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <section aria-label="Documents">
          <h2 className="mb-2 text-sm font-semibold text-muted">Documents</h2>
          <div className="flex flex-col gap-2">
            {docs.map((doc) => (
              <Card key={doc.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.title}</p>
                  <p className="text-xs text-muted">
                    {doc.country} · v{doc.version} · effective {doc.effectiveDate.toISOString().slice(0, 10)} · {doc.audience}
                    {doc.owner ? ` · owner: ${doc.owner}` : ""}
                  </p>
                </div>
                <Chip variant={doc.status === "ACTIVE" ? "success" : "neutral"}>{doc.status.toLowerCase()}</Chip>
              </Card>
            ))}
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Top unanswered questions (content-gap feed)</h2>
          {unanswered.length === 0 ? (
            <p className="text-sm text-muted">No abstentions yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {unanswered.map((u, i) => (
                <li key={i} className="rounded-[--radius-control] bg-surface-2 px-3 py-1.5">{u.query}</li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Publish new version">
          <h2 className="mb-2 text-sm font-semibold text-muted">Publish a policy version</h2>
          <Card className="p-4">
            <form action={publishPolicyAction}>
              <Field label="Title" hint="Publishing with an existing title supersedes the old version (its chunks are flagged, never deleted).">
                <Input name="title" required placeholder="e.g. Leave & Time Off Policy" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
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
            </form>
          </Card>
        </section>
      </div>
    </div>
  );
}
