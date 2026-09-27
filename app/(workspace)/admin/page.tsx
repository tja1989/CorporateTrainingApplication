import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { PageHeader, DemoBanner, Chip } from "@/components/ui";
import { WorkspaceLink } from "@/components/workspace-ui";
export const dynamic = "force-dynamic";
const count = sql<number>`count(*)::int`;
export default async function AdminOverviewPage() {
  await requireRole("ADMIN");
  const [[users], [courses], [enrollments], [overdue], [grading], [drafts], [tickets], [failedIngest], [flagged]] = await Promise.all([
    db.select({ n: count }).from(t.users), db.select({ n: count }).from(t.courses), db.select({ n: count }).from(t.enrollments),
    db.select({ n: count }).from(t.enrollments).where(eq(t.enrollments.complianceStatus, "OVERDUE")),
    db.select({ n: count }).from(t.gradingReviews).where(eq(t.gradingReviews.state, "PENDING")), db.select({ n: count }).from(t.questions).where(eq(t.questions.status, "DRAFT")),
    db.select({ n: count }).from(t.hrTickets).where(inArray(t.hrTickets.state, ["OPEN", "IN_PROGRESS"])), db.select({ n: count }).from(t.videos).where(eq(t.videos.ingestionStatus, "FAILED")),
    db.select({ n: sql<number>`count(DISTINCT ${t.integrityEvents.attemptId})::int` }).from(t.integrityEvents).innerJoin(t.attempts, eq(t.attempts.id, t.integrityEvents.attemptId)).where(and(inArray(t.integrityEvents.severity, ["red", "orange"]), notInArray(t.attempts.state, ["IN_PROGRESS", "CLEARED", "VOIDED"]))),
  ]);
  const queues = [
    { label: "Grades awaiting review", n: grading?.n ?? 0, body: "Confirm or adjust AI grades before learners receive final results.", href: "/admin/reviews?view=grades" },
    { label: "Open HR tickets", n: tickets?.n ?? 0, body: "Read consented escalations, reply to employees and resolve requests.", href: "/admin/tickets" },
    { label: "Integrity flags to decide", n: flagged?.n ?? 0, body: "Review the event timeline before clearing or voiding an attempt.", href: "/admin/integrity" },
    { label: "AI question drafts", n: drafts?.n ?? 0, body: "Review source content and answers before approving questions.", href: "/admin/reviews?view=drafts" },
    { label: "Failed video ingestions", n: failedIngest?.n ?? 0, body: "Open a course to inspect failed videos and retry ingestion.", href: "/admin/courses" },
  ];
  return <div><DemoBanner /><PageHeader title="Overview" sub="Manage learning and focus on the decisions that need a person." actions={<WorkspaceLink href="/admin/courses#new-course">Create a course</WorkspaceLink>} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><section aria-label="Work queues"><h2 className="mb-3 text-lg font-semibold">Needs attention</h2><div className="divide-y divide-border rounded-card border border-border bg-surface">{queues.map(q => <a key={q.label} href={q.href} className="flex items-start gap-4 p-4 hover:bg-surface-2"><div className="min-w-0 flex-1"><h3 className="font-semibold text-link">{q.label}</h3><p className="mt-1 text-sm text-muted">{q.body}</p></div><Chip variant={q.n ? "warning" : "neutral"}>{q.n}</Chip></a>)}</div></section>
      <section aria-label="Training overview"><h2 className="mb-3 text-lg font-semibold">Training overview</h2><dl className="divide-y divide-border rounded-card border border-border bg-surface">{[{ label: "People", value: users?.n ?? 0, href: "/admin/people" }, { label: "Courses", value: courses?.n ?? 0, href: "/admin/courses" }, { label: "Enrollments", value: enrollments?.n ?? 0, href: "/admin/reports?report=completion" }, { label: "Overdue assignments", value: overdue?.n ?? 0, href: "/admin/reports?report=compliance&status=OVERDUE" }].map(s => <div key={s.label} className="flex items-center justify-between gap-3 p-4"><dt><a href={s.href} className="link touch-target inline-flex items-center">{s.label}</a></dt><dd className="font-semibold">{s.value}</dd></div>)}</dl><a href="/admin/people?view=import" className="link mt-4 inline-flex touch-target items-center">Import employees from CSV →</a></section>
    </div>
  </div>;
}
