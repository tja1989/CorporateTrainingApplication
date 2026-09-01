import { requireUser } from "@/lib/auth/guard";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DrillPage() {
  await requireUser();
  return <EmptyState icon="◎" title="Daily drill" body="Complete your first lesson to unlock practice." />;
}
