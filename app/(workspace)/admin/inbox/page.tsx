import { requireRole } from "@/lib/auth/guard";
import { InboxList } from "@/components/inbox-list";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage() {
  const user = await requireRole("ADMIN");
  return <InboxList userId={user.id} />;
}
