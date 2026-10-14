import { apiUser } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { feedbackReport, feedbackCsv } from "@/lib/feedback/reports";
import { feedbackReportFilters } from "@/lib/feedback/report-options";
export async function GET(req: Request) {
  const actor = await apiUser();
  if (!actor || !hasPermission(actor.role, "feedback.read"))
    return new Response("Forbidden", { status: 403 });
  let filters;
  try {
    filters = feedbackReportFilters(
      Object.fromEntries(new URL(req.url).searchParams),
    );
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Invalid report filters",
      { status: 400 },
    );
  }
  try {
    const report = await feedbackReport(actor, filters);
    return new Response(feedbackCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filters.kind}-feedback-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response(
      "Could not generate the feedback report. Reload and try again.",
      { status: 500 },
    );
  }
}
