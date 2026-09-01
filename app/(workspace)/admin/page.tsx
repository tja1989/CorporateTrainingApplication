import { sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Card, PageTitle, DemoBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireRole("ADMIN");
  const [users] = await db.select({ n: sql<number>`count(*)::int` }).from(t.users);
  const [courses] = await db.select({ n: sql<number>`count(*)::int` }).from(t.courses);
  const [enrollments] = await db.select({ n: sql<number>`count(*)::int` }).from(t.enrollments);
  const [overdue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.enrollments)
    .where(sql`compliance_status = 'OVERDUE'`);

  const tiles = [
    { label: "People", value: users?.n ?? 0 },
    { label: "Courses", value: courses?.n ?? 0 },
    { label: "Enrollments", value: enrollments?.n ?? 0 },
    { label: "Overdue", value: overdue?.n ?? 0 },
  ];

  return (
    <div className="animate-slide-up">
      <DemoBanner />
      <PageTitle sub="Platform at a glance.">Overview</PageTitle>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-4">
            <p className="text-2xl font-semibold">{tile.value}</p>
            <p className="text-xs text-muted">{tile.label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
