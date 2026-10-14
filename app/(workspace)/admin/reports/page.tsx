import { desc, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { runReport } from "@/lib/reports";
import { REPORTS, reportFilters, type ReportParams } from "@/lib/report-options";
import { PageHeader } from "@/components/ui";
import { WorkspaceReports } from "@/components/workspace-reports";
import { AskReports } from "./ask";
export const dynamic = "force-dynamic";
export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportParams> }) {
  await requireRole("ADMIN"); const params = await searchParams;
  const report = REPORTS.find(r => r.id === params.report)?.id ?? "completion";
  const result = await runReport(report, reportFilters(params));
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


  return <div><PageHeader title="Reports" sub="Organization-wide training data. Choose a report, then apply the filters you need." /><WorkspaceReports base="/admin/reports" report={report} params={params} result={result} /><div className="mt-8"><AskReports /></div>
    <details className="mt-6 rounded-card border border-border bg-surface p-4"><summary className="touch-target flex items-center font-semibold">AI usage and cost</summary><dl className="mt-4 grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-muted">Total AI spend</dt><dd>${(cost?.cost ?? 0).toFixed(2)} · {cost?.calls ?? 0} calls</dd></div><div><dt className="text-sm text-muted">Tokens processed</dt><dd>{cost?.tokens ?? 0}</dd></div><div><dt className="text-sm text-muted">Cost per active user (30 days)</dt><dd>${activeUsers?.n ? ((cost?.cost ?? 0) / activeUsers.n).toFixed(3) : "0.000"}</dd></div></dl><ul className="mt-4 text-sm">{routeCosts.map(r => <li key={r.route} className="flex flex-wrap justify-between gap-3 border-t border-border py-2"><span>{r.route}</span><span>${r.cost.toFixed(3)} · {r.calls} calls</span></li>)}</ul>{!routeCosts.length ? <p className="mt-4 text-sm text-muted">No AI calls logged yet.</p> : null}</details>
  </div>;
}
