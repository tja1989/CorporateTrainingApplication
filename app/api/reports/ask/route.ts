import { canReadReports } from "@/lib/report-options";
import { currentUser } from "@/lib/auth/guard";
import { planFromQuestion, runReport, narrate } from "@/lib/reports";
import { aiAvailable } from "@/lib/ai/gateway";
import { reportScopeFor } from "@/lib/auth/report-scope";

/** Ask Reports (spec FR-10.3): typed plan → whitelisted execution, scoped to the asker. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !canReadReports(user))
    return new Response("Forbidden", { status: 403 });
  const body = (await req.json()) as { question: string; scope?: string };
  if (!body.question?.trim() || body.question.length > 500)
    return new Response("Bad request", { status: 400 });

  const plan = await planFromQuestion(body.question.trim());
  Object.assign(
    plan.filters,
    await reportScopeFor(user, body.scope === "team"),
  );
  const result = await runReport(plan.report, plan.filters);
  return Response.json({
    plan: {
      report: plan.report,
      filters: {
        ...plan.filters,
        userIds: undefined,
        courseIds: undefined,
        instructorView: undefined,
      },
      explanation: plan.explanation,
    },
    narration: narrate(result, plan),
    columns: result.columns,
    rows: result.rows,
    mock: !aiAvailable(),
  });
}
