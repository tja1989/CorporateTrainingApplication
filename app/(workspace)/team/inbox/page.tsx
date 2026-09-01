import { requireRole } from "@/lib/auth/guard";
import { InboxList } from "@/components/inbox-list";

export const dynamic = "force-dynamic";

export default async function TeamInboxPage() {
  const user = await requireRole("MANAGER", "ADMIN");
  return <InboxList userId={user.id} />;
}
