import { requireUser } from "@/lib/auth/guard";
import { InboxList } from "@/components/inbox-list";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await requireUser();
  return <InboxList userId={user.id} />;
}
