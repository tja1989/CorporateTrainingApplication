import { currentUser, teamOf } from "@/lib/auth/guard";
import { runReport, toCsv, type ReportId } from "@/lib/reports";

const VALID: ReportId[] = ["completion", "compliance", "transcript", "cert_expiry", "engagement", "quiz_results"];

export async function GET(req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const user = await currentUser();
  if (!user || user.role === "LEARNER") return new Response("Forbidden", { status: 403 });
  const { reportId } = await params;
  if (!VALID.includes(reportId as ReportId)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const filters = {
    courseTitle: url.searchParams.get("course") || undefined,
    storeName: url.searchParams.get("store") || undefined,
    complianceStatus: url.searchParams.get("status") || undefined,
    daysWindow: url.searchParams.get("days") ? Number(url.searchParams.get("days")) : undefined,
    userIds: user.role === "MANAGER" ? (await teamOf(user.id)).map((u) => u.id) : undefined,
  };
  const result = await runReport(reportId as ReportId, filters);
  return new Response(toCsv(result), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportId}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
