import { requireRole } from "@/lib/auth/guard";
import { TrainingRollout } from "@/components/training-rollout";
export const dynamic = "force-dynamic";
export default async function Page() {
  return <TrainingRollout actor={await requireRole("HR_HEAD")} />;
}
