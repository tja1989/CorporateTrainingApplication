import { currentUser } from "@/lib/auth/guard";
import { planFromQuestion, runReport, narrate } from "@/lib/reports";
import { aiAvailable } from "@/lib/ai/gateway";
import { teamOf } from "@/lib/auth/guard";

/** Ask Reports (spec FR-10.3): typed plan → whitelisted execution, scoped to the asker. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role === "LEARNER") return new Response("Forbidden", { status: 403 });
  const body = (await req.json()) as { question: string };
  if (!body.question?.trim() || body.question.length > 500) return new Response("Bad request", { status: 400 });

  const plan = await planFromQuestion(body.question.trim());
  // scope injection is server-side only: managers see their team, never model-chosen
  if (user.role === "MANAGER") {
    const team = await teamOf(user.id);
    plan.filters.userIds = team.map((u) => u.id);
  }
  const result = await runReport(plan.report, plan.filters);
  return Response.json({
    plan: { report: plan.report, filters: { ...plan.filters, userIds: undefined }, explanation: plan.explanation },
    narration: narrate(result, plan),
    columns: result.columns,
    rows: result.rows,
    mock: !aiAvailable(),
  });
}
