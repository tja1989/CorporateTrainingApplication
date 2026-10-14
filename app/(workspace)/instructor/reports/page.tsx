import { requireRole } from "@/lib/auth/guard";
import { TrainingReports } from "@/components/training-reports";
import type { ReportParams } from "@/lib/report-options";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ReportParams>;
}) {
  return (
    <TrainingReports
      actor={await requireRole("INSTRUCTOR")}
      params={await searchParams}
      base="/instructor/reports"
    />
  );
}
