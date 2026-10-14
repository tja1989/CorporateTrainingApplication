import { requireRole } from "@/lib/auth/guard";
import { reportScopeFor } from "@/lib/auth/report-scope";
import { runReport } from "@/lib/reports";
import {
  REPORTS,
  reportFilters,
  type ReportParams,
} from "@/lib/report-options";
import { PageHeader } from "@/components/ui";
import { WorkspaceReports } from "@/components/workspace-reports";
import { AskReports } from "../../admin/reports/ask";
export const dynamic = "force-dynamic";
export default async function TeamReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportParams>;
}) {
  const manager = await requireRole("MANAGER", "ADMIN");
  const params = await searchParams;
  const report =
    REPORTS.find((r) => r.id === params.report)?.id ?? "compliance";
  const scope = await reportScopeFor(manager, true);
  const result = await runReport(report, {
    ...reportFilters(params),
    ...scope,
  });
  return (
    <div>
      <PageHeader
        title="Team reports"
        sub={`${scope.userIds?.length ?? 0} employees included. Filters and exports keep the same department or assigned-team scope.`}
      />
      <WorkspaceReports
        base="/team/reports"
        report={report}
        params={params}
        result={result}
      />
      <div className="mt-8">
        <AskReports scope="team" />
      </div>
    </div>
  );
}
