import { requireUser } from "@/lib/auth/guard";
import { InboxList } from "@/components/inbox-list";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  return <InboxList userId={user.id} page={(await searchParams).page} />;
}
