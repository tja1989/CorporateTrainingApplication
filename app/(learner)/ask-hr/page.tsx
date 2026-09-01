import { requireUser } from "@/lib/auth/guard";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AskHrPage() {
  await requireUser();
  return <EmptyState icon="✳" title="Ask HR" body="The HR assistant is being prepared." />;
}
