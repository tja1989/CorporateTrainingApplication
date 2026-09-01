import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { PageHeader, DemoBanner, Tile } from "@/components/ui";

export const dynamic = "force-dynamic";

const count = sql<number>`count(*)::int`;

/**
 * Admin overview — an honest summary mosaic (spec §10.7 v1.2): every tile
 * answers one question at a glance and links to where the work happens.
 */
export default async function AdminOverviewPage() {
  await requireRole("ADMIN");
  const [[users], [courses], [enrollments], [overdue], [grading], [drafts], [tickets], [failedIngest], [flagged]] = await Promise.all([
    db.select({ n: count }).from(t.users),
    db.select({ n: count }).from(t.courses),
    db.select({ n: count }).from(t.enrollments),
    db.select({ n: count }).from(t.enrollments).where(eq(t.enrollments.complianceStatus, "OVERDUE")),
    db.select({ n: count }).from(t.gradingReviews).where(eq(t.gradingReviews.state, "PENDING")),
    db.select({ n: count }).from(t.questions).where(eq(t.questions.status, "DRAFT")),
    db.select({ n: count }).from(t.hrTickets).where(eq(t.hrTickets.state, "OPEN")),
    db.select({ n: count }).from(t.videos).where(eq(t.videos.ingestionStatus, "FAILED")),
    db
      .select({ n: sql<number>`count(DISTINCT ${t.integrityEvents.attemptId})::int` })
      .from(t.integrityEvents)
      .innerJoin(t.attempts, eq(t.attempts.id, t.integrityEvents.attemptId))
      .where(and(inArray(t.integrityEvents.severity, ["red", "orange"]), notInArray(t.attempts.state, ["IN_PROGRESS", "CLEARED", "VOIDED"]))),
  ]);
  const pendingReviews = (grading?.n ?? 0) + (drafts?.n ?? 0);

  return (
    <div className="animate-slide-up">
      <DemoBanner />
      <PageHeader title="Overview" sub="Platform at a glance — every tile opens the work behind it." />
      <div className="grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Platform status">
        <Tile label="People" value={users?.n ?? 0} href="/admin/people" />
        <Tile label="Courses" value={courses?.n ?? 0} href="/admin/courses" />
        <Tile label="Enrollments" value={enrollments?.n ?? 0} href="/admin/reports?report=completion" />
        <Tile label="Overdue" value={overdue?.n ?? 0} tone={(overdue?.n ?? 0) > 0 ? "destructive" : "success"} href="/admin/reports?report=compliance&status=OVERDUE" />
        <Tile label="Awaiting review" value={pendingReviews} hint={`${grading?.n ?? 0} grades · ${drafts?.n ?? 0} AI drafts`} tone={pendingReviews > 0 ? "warning" : "success"} href="/admin/reviews" />
        <Tile label="Open HR tickets" value={tickets?.n ?? 0} tone={(tickets?.n ?? 0) > 0 ? "warning" : "success"} href="/admin/tickets" />
        <Tile label="Failed ingestions" value={failedIngest?.n ?? 0} tone={(failedIngest?.n ?? 0) > 0 ? "destructive" : "success"} href="/admin/courses" />
        <Tile label="Integrity flags to decide" value={flagged?.n ?? 0} tone={(flagged?.n ?? 0) > 0 ? "warning" : "success"} href="/admin/integrity" />
      </div>
    </div>
  );
}
