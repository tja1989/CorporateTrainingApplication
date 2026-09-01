import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Card, PageTitle, ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ResetCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const manager = await requireRole("MANAGER", "ADMIN");
  const { userId } = await params;
  const { code } = await searchParams;
  const [member] = await db.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  if (!member || (manager.role === "MANAGER" && member.managerId !== manager.id) || !code) notFound();

  return (
    <div className="animate-slide-up mx-auto max-w-md">
      <PageTitle sub={`One-time activation code for ${member.name} (${member.employeeId}). Shown once — write it down or tell them now.`}>
        Reset code issued
      </PageTitle>
      <Card className="mb-4 p-6 text-center">
        <p className="font-mono text-3xl font-semibold tracking-widest">{code}</p>
        <p className="mt-2 text-xs text-muted">Valid 14 days. They sign in at /activate with their employee ID and this code.</p>
      </Card>
      <ButtonLink variant="secondary" href={`/team/${member.id}`}>Back</ButtonLink>
    </div>
  );
}
