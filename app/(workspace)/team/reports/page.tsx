import Link from "next/link";
import { requireRole, teamOf } from "@/lib/auth/guard";
import { runReport, type ReportId } from "@/lib/reports";
import { Card, PageTitle, ButtonLink, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const REPORTS: Array<{ id: ReportId; label: string }> = [
  { id: "completion", label: "Completion" },
  { id: "compliance", label: "Compliance" },
  { id: "cert_expiry", label: "Cert expiry" },
  { id: "engagement", label: "Engagement" },
];

/** Team-scoped reports (spec FR-10.1/10.2) — scope injected server-side. */
export default async function TeamReportsPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const manager = await requireRole("MANAGER", "ADMIN");
  const { report } = await searchParams;
  const reportId = (REPORTS.find((r) => r.id === report)?.id ?? "compliance") as ReportId;
  const team = await teamOf(manager.id);
  const result = await runReport(reportId, { userIds: team.map((u) => u.id) });

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Scoped to your direct reports.">Team reports</PageTitle>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {REPORTS.map((r) => (
          <Link key={r.id} href={`/team/reports?report=${r.id}`}>
            <span className={cx("inline-block rounded-full px-3 py-1.5 text-sm font-medium", r.id === reportId ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-foreground")}>
              {r.label}
            </span>
          </Link>
        ))}
      </div>
      <Card className="mb-2 max-w-4xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {result.columns.map((c) => (
                <th key={c} className="px-3 py-2 text-start font-medium text-muted">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={result.columns.length} className="px-3 py-6 text-center text-muted">No rows.</td></tr>
            ) : (
              result.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2">{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      <ButtonLink variant="secondary" href={`/api/reports/${reportId}/csv`}>Export CSV</ButtonLink>
    </div>
  );
}
