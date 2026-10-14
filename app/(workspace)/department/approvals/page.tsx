import { requireRole } from "@/lib/auth/guard";
import { TrainingOverview } from "@/components/training-overview";
export const dynamic = "force-dynamic";
export default async function Page() {
  return (
    <TrainingOverview
      actor={await requireRole("DEPARTMENT_HEAD")}
      approvalsOnly
    />
  );
}
