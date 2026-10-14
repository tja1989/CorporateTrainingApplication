import { currentUser } from "@/lib/auth/guard";
import { reportScopeFor } from "@/lib/auth/report-scope";
import { reportFilters, canReadReports } from "@/lib/report-options";
import { runReport, toCsv, type ReportId } from "@/lib/reports";

const VALID: ReportId[] = [
  "completion",
  "compliance",
  "transcript",
  "cert_expiry",
  "engagement",
  "quiz_results",
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const user = await currentUser();
  if (!user || !canReadReports(user))
    return new Response("Forbidden", { status: 403 });
  const { reportId } = await params;
  if (!VALID.includes(reportId as ReportId))
    return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const filters = {
    ...reportFilters(Object.fromEntries(url.searchParams)),
    ...(await reportScopeFor(user, url.searchParams.get("scope") === "team")),
  };
  const result = await runReport(reportId as ReportId, filters);
  return new Response(toCsv(result), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportId}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
