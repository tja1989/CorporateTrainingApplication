import { requireRole } from "@/lib/auth/guard";
import { InboxList } from "@/components/inbox-list";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await requireRole("HR_HEAD");
  return <InboxList userId={actor.id} page={(await searchParams).page} />;
}
