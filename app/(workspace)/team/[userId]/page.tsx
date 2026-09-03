import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Button, Card, Chip, Field, PageTitle, Select, complianceChip } from "@/components/ui";
import { assignAction, nudgeAction, issueResetAction } from "../actions";
import { interviewsForUser } from "@/lib/live/store";

export const dynamic = "force-dynamic";

export default async function TeamMemberPage({ params }: { params: Promise<{ userId: string }> }) {
  const manager = await requireRole("MANAGER", "ADMIN");
  const { userId } = await params;
  const [member] = await db.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  if (!member || (manager.role === "MANAGER" && member.managerId !== manager.id)) notFound();

  const enrollments = await db
    .select()
    .from(t.enrollments)
    .where(eq(t.enrollments.userId, member.id))
    .orderBy(desc(t.enrollments.createdAt));
  const courses = await db.select().from(t.courses).where(eq(t.courses.status, "PUBLISHED"));
  const courseOf = new Map(courses.map((c) => [c.id, c]));
  const paths = await db.select().from(t.paths);
  const records = await db.select().from(t.completionRecords).where(eq(t.completionRecords.userId, member.id));
  const oralChecks = await interviewsForUser(member.id, 10);

  const [lastNudge] = await db
    .select()
    .from(t.notifications)
    .where(and(eq(t.notifications.userId, member.id), eq(t.notifications.kind, "overdue"), eq(t.notifications.dedupeKey, `nudge:${member.id}`)))
    .limit(1);
  const nudgedRecently = lastNudge && Date.now() - lastNudge.sentAt.getTime() < 48 * 3600_000;

  return (
    <div className="animate-slide-up mx-auto max-w-2xl">
      <PageTitle sub={`${member.jobTitle ?? ""} · ID ${member.employeeId}${member.email ? ` · ${member.email}` : " · no email"}`}>
        {member.name}
      </PageTitle>

      <section className="mb-6" aria-label="Enrollments">
        <h2 className="eyebrow mb-2 text-muted">Enrollments</h2>
        <div className="flex flex-col gap-2">
          {enrollments
            .filter((e) => e.status !== "WITHDRAWN")
            .map((e) => {
              const chip = complianceChip(e.complianceStatus);
              return (
                <Card key={e.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{courseOf.get(e.courseId)?.title ?? e.courseId}</p>
                    <p className="text-xs text-muted">
                      {e.source}{e.dueAt ? ` · due ${e.dueAt.toISOString().slice(0, 10)}` : ""}
                    </p>
                  </div>
                  <Chip variant={chip.variant}>{chip.label}</Chip>
                </Card>
              );
            })}
          {enrollments.filter((e) => e.status !== "WITHDRAWN").length === 0 ? (
            <p className="text-sm text-muted">No active enrollments.</p>
          ) : null}
        </div>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-2" aria-label="Actions">
        <Card className="p-4">
          <h2 className="eyebrow mb-2 text-muted">Assign training</h2>
          <form action={assignAction.bind(null, member.id)}>
            <Field label="Course or path">
              <Select name="target" required>
                <optgroup label="Courses">
                  {courses.map((c) => (
                    <option key={c.id} value={`course:${c.id}`}>{c.title}</option>
                  ))}
                </optgroup>
                <optgroup label="Paths">
                  {paths.map((p) => (
                    <option key={p.id} value={`path:${p.id}`}>{p.title}</option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <Field label="Due in (days)">
              <Select name="dueDays" defaultValue="14">
                {[7, 14, 30, 60].map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Assign</Button>
          </form>
        </Card>
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="eyebrow mb-2 text-muted">Nudge</h2>
            <form action={nudgeAction.bind(null, member.id)}>
              <Button type="submit" variant="secondary" disabled={!!nudgedRecently}>
                {nudgedRecently ? "Nudged in the last 48h" : "Send reminder now"}
              </Button>
            </form>
            {!member.email ? <p className="mt-1 text-xs text-muted">No email — the nudge lands in-app; mention it in person too.</p> : null}
          </div>
          <div>
            <h2 className="eyebrow mb-2 text-muted">Account help</h2>
            <form action={issueResetAction.bind(null, member.id)}>
              <Button type="submit" variant="secondary">Issue password reset code</Button>
            </form>
            <p className="mt-1 text-xs text-muted">Verify identity first. The code shows once and is audit-logged.</p>
          </div>
        </Card>
      </section>

      <section aria-label="History">
        <h2 className="eyebrow mb-2 text-muted">Completions</h2>
        {records.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {records.map((r) => (
              <li key={r.id} className="flex justify-between rounded-control bg-surface-2 px-3 py-1">
                <span>{courseOf.get(r.courseId)?.title ?? r.courseId}</span>
                <span className="text-muted">{r.completedAt.toISOString().slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-label="Oral checks">
        <h2 className="eyebrow mb-2 text-muted">Oral checks</h2>
        {oralChecks.length === 0 ? (
          <p className="text-sm text-muted">No spoken checks taken yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {oralChecks.map((c) => (
              <Card key={c.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.lessonTitle}</p>
                    <p className="text-xs text-muted">{c.courseTitle} · {c.completedAt?.toISOString().slice(0, 10)}</p>
                  </div>
                  <Chip variant={c.outcome === "PASS" ? "success" : "warning"}>{c.scorePct ?? 0}% · {c.outcome === "PASS" ? "passed" : c.reviewedAt ? "not passed · reviewed" : "not passed"}</Chip>
                </div>
                {c.evaluation?.overall_summary ? <p className="mt-2 text-xs text-muted">{c.evaluation.overall_summary}</p> : null}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs text-muted">Transcript ({c.transcript.length} turns)</summary>
                  <div className="mt-2 flex flex-col gap-1" dir="auto">
                    {c.transcript.map((turn, i) => (
                      <p key={i} className="rounded-control bg-surface-2 px-3 py-1 text-xs">
                        <span className="text-muted">{turn.role === "user" ? member.name.split(" ")[0] : "Interviewer"}:</span> {turn.text}
                      </p>
                    ))}
                  </div>
                </details>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
