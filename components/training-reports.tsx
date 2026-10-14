import type { CurrentUser } from "@/lib/auth/guard";
import { reportScopeFor } from "@/lib/auth/report-scope";
import { runReport } from "@/lib/reports";
import {
  REPORTS,
  reportFilters,
  type ReportParams,
} from "@/lib/report-options";
import { AskReports } from "@/app/(workspace)/admin/reports/ask";
import { PageHeader } from "./ui";
import { WorkspaceReports } from "./workspace-reports";
export async function TrainingReports({
  actor,
  params,
  base,
}: {
  actor: CurrentUser;
  params: ReportParams;
  base: string;
}) {
  const report =
    REPORTS.find((r) => r.id === params.report)?.id ?? "completion";
  const scope = await reportScopeFor(actor);
  const result = await runReport(report, {
    ...reportFilters(params),
    ...scope,
  });
  const sub =
    actor.role === "INSTRUCTOR"
      ? "Training activity for your assigned courses and their enrolled learners."
      : actor.role === "DEPARTMENT_HEAD"
        ? "Your department’s employees, including their shared and cross-department courses."
        : "Organization-wide training, completion and compliance.";
  return (
    <div>
      <PageHeader title="Training reports" sub={sub} />
      <WorkspaceReports
        base={base}
        report={report}
        params={params}
        result={result}
        instructor={actor.role === "INSTRUCTOR"}
      />
      <div className="mt-8">
        <AskReports />
      </div>
    </div>
  );
}
