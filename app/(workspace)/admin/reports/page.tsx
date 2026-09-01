import { desc, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { runReport, type ReportFilters, type ReportId } from "@/lib/reports";
import { Button, Card, Chip, Input, PageHeader, ButtonLink, SectionTitle, Tile } from "@/components/ui";
import { LinkTabs } from "@/components/tabs";
import { AskReports } from "./ask";

export const dynamic = "force-dynamic";

const REPORTS: Array<{ id: ReportId; label: string }> = [
  { id: "completion", label: "Completion" },
  { id: "compliance", label: "Compliance matrix" },
  { id: "transcript", label: "Transcripts" },
  { id: "cert_expiry", label: "Cert expiry" },
  { id: "engagement", label: "Engagement" },
  { id: "quiz_results", label: "Quiz results" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; course?: string; store?: string; status?: string; days?: string }>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const reportId = (REPORTS.find((r) => r.id === params.report)?.id ?? "completion") as ReportId;
  const filters: ReportFilters = {
    courseTitle: params.course || undefined,
    storeName: params.store || undefined,
    complianceStatus: params.status || undefined,
    daysWindow: params.days ? Number(params.days) : undefined,
  };
  const result = await runReport(reportId, filters);

  // AI cost panel (spec FR-13.7)
  const [cost] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      cost: sql<number>`coalesce(sum(est_cost),0)::float`,
      tokens: sql<number>`coalesce(sum(input_tokens + output_tokens),0)::int`,
    })
    .from(t.aiCallLog);
  const [activeUsers] = await db
    .select({ n: sql<number>`count(DISTINCT user_id)::int` })
    .from(t.uiEvents)
    .where(sql`ts > now() - interval '30 days'`);
  const routeCosts = await db
    .select({ route: t.aiCallLog.route, calls: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(est_cost),0)::float` })
    .from(t.aiCallLog)
    .groupBy(t.aiCallLog.route)
    .orderBy(desc(sql`sum(est_cost)`));

  const qs = new URLSearchParams();
  if (params.course) qs.set("course", params.course);
  if (params.store) qs.set("store", params.store);
  if (params.status) qs.set("status", params.status);
  if (params.days) qs.set("days", params.days);
  const tail = qs.toString();

  return (
    <div className="animate-slide-up">
      <PageHeader title="Reports" sub="Every report is live — filters apply instantly. Ask in plain language below." />

      <AskReports />

      <LinkTabs
        label="Report"
        param="report"
        className="mb-4 mt-6"
        items={REPORTS.map((r) => ({ href: `/admin/reports?report=${r.id}${tail ? `&${tail}` : ""}`, label: r.label }))}
      />

      <form className="mb-4 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-5" action="/admin/reports" method="get">
        <input type="hidden" name="report" value={reportId} />
        <Input name="course" placeholder="Course…" defaultValue={params.course ?? ""} aria-label="Filter by course" />
        <Input name="store" placeholder="Store…" defaultValue={params.store ?? ""} aria-label="Filter by store" />
        <Input name="status" placeholder="Status (e.g. OVERDUE)" defaultValue={params.status ?? ""} aria-label="Filter by status" />
        <Input name="days" placeholder="Days window" defaultValue={params.days ?? ""} aria-label="Days window" />
        <Button type="submit" variant="secondary">Apply</Button>
      </form>

      {/* Data tables may scroll horizontally — they are page-level data, not tiles (spec §10.7 v1.2) */}
      <Card className="mb-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start">
              {result.columns.map((c) => (
                <th key={c} className="px-3 py-2 text-start font-medium text-muted">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={result.columns.length} className="px-3 py-6 text-center text-muted">No rows match these filters.</td></tr>
            ) : (
              result.rows.slice(0, 200).map((row, i) => (
                <tr key={i} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2">
                      {String(cell) === "OVERDUE" || String(cell) === "EXPIRED" ? <Chip variant="destructive">{cell}</Chip>
                        : String(cell) === "DUE_SOON" || String(cell) === "COMPLETED_EXPIRING" || String(cell) === "INACTIVE" ? <Chip variant="warning">{String(cell).replace("_", " ")}</Chip>
                        : String(cell) === "COMPLETED" || String(cell) === "ACTIVE" ? <Chip variant="success">{cell}</Chip>
                        : cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      <div className="mb-8 flex items-center gap-3">
        <ButtonLink variant="secondary" href={`/api/reports/${reportId}/csv?${tail}`}>Export CSV</ButtonLink>
        <span className="text-xs text-muted">{result.rows.length} row(s)</span>
      </div>

      <section aria-label="AI cost" className="max-w-3xl">
        <SectionTitle>AI cost (ROI denominator)</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile value={`$${(cost?.cost ?? 0).toFixed(2)}`} label="Total AI spend" hint={`${cost?.calls ?? 0} calls · ${((cost?.tokens ?? 0) / 1000).toFixed(1)}k tokens`} />
          <Tile value={`$${activeUsers?.n ? ((cost?.cost ?? 0) / activeUsers.n).toFixed(3) : "0.000"}`} label="Cost per active user (30d)" />
          <Card className="p-4">
            <p className="mb-1 text-xs text-muted">By route</p>
            {routeCosts.slice(0, 4).map((r) => (
              <p key={r.route} className="flex justify-between text-xs"><span className="text-muted">{r.route}</span><span>${r.cost.toFixed(3)} · {r.calls}</span></p>
            ))}
            {routeCosts.length === 0 ? <p className="text-xs text-muted">No AI calls logged yet.</p> : null}
          </Card>
        </div>
      </section>
    </div>
  );
}
