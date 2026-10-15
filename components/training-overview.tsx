// THESIS: waiting work leads each role's workspace.
// OWN-WORLD: use xprtn's existing white/blue surfaces, type and controls.
// STORY: find the course, inspect the revision, take the permitted next action.
// FIRST VIEWPORT: role heading, key destinations, then a real approval queue.
// FORM: an operational queue within the approved application design.
import { desc, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import { canReadCourse, courseWorkspacePath } from "@/lib/courses/ownership";
import { defaultWorkspace, workspaceHome } from "@/lib/auth/roles";
import { StatusChip, PageHeader, EmptyState, Tile } from "./ui";
import { CourseCover } from "./course-cover";
import { trainingScope } from "@/lib/auth/scope";
import { overviewFigures, type OverviewRole } from "@/lib/overview";
import { plural } from "@/lib/format";
export async function TrainingOverview({
  actor,
  approvalsOnly = false,
}: {
  actor: CurrentUser;
  approvalsOnly?: boolean;
}) {
  const base = workspaceHome(defaultWorkspace(actor.role));
  const all = (
    await db.select().from(t.courses).orderBy(desc(t.courses.createdAt))
  ).filter((course) => canReadCourse(actor, course));
  const waiting = all.filter((course) =>
    actor.role === "HR_HEAD"
      ? course.approvalState === "APPROVED" && course.status === "DRAFT"
      : actor.role === "DEPARTMENT_HEAD"
        ? course.approvalState === "SUBMITTED" && course.status === "DRAFT"
        : ["DRAFT", "REJECTED", "SUBMITTED"].includes(course.approvalState) &&
          course.status === "DRAFT",
  );
  const title = approvalsOnly
    ? "Course approvals"
    : actor.role === "HR_HEAD"
      ? "HR workspace"
      : actor.role === "DEPARTMENT_HEAD"
        ? "Department workspace"
        : "Instructor workspace";
  const sub =
    actor.role === "HR_HEAD"
      ? "Publish approved revisions, roll out training, and follow completion across the organization."
      : actor.role === "DEPARTMENT_HEAD"
        ? "Review your department’s submissions and follow employee learning."
        : "Build your assigned courses, respond to review comments, and submit ready revisions.";
  let team = { overdue: 0, dueSoon: 0 };
  if (actor.role === "DEPARTMENT_HEAD" && !approvalsOnly) {
    const scope = await trainingScope(actor);
    const rows = scope.userIds?.length
      ? await db.select({ status: t.enrollments.status, complianceStatus: t.enrollments.complianceStatus }).from(t.enrollments).where(inArray(t.enrollments.userId, scope.userIds))
      : [];
    const live = rows.filter((r) => r.status !== "WITHDRAWN");
    team = { overdue: live.filter((r) => r.complianceStatus === "OVERDUE").length, dueSoon: live.filter((r) => r.complianceStatus === "DUE_SOON").length };
  }
  const figures = approvalsOnly ? [] : overviewFigures(actor.role as OverviewRole, base, all, team);
  const shown = approvalsOnly ? waiting : waiting.slice(0, 5);
  const reviewAll = actor.role === "DEPARTMENT_HEAD" ? `${base}/approvals` : `${base}/courses`;
  return (
    <div>
      <PageHeader title={title} sub={sub} />
      {!actor.departmentId && actor.role !== "HR_HEAD" ? (
        <p className="mb-6 rounded-control border border-border bg-surface p-4 text-sm">
          Your account has no department. Ask Super Admin to assign one before
          submitting or approving courses.
        </p>
      ) : null}
      {figures.length ? (
        <section aria-label="Summary" className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {figures.map((f) => (
            <Tile key={f.label} label={f.label} value={f.value} href={f.href} tone={f.tone} />
          ))}
        </section>
      ) : null}
      <section aria-label="Courses needing attention">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="type-section">
            {actor.role === "HR_HEAD"
              ? "Ready to publish"
              : actor.role === "DEPARTMENT_HEAD"
                ? "Awaiting your review"
                : "Courses in progress"}
          </h2>
          <span className="flex items-center gap-4 text-sm text-muted">
            {plural(waiting.length, "course")}
            {!approvalsOnly && waiting.length > shown.length ? (
              <a className="link" href={reviewAll}>Review all</a>
            ) : null}
          </span>
        </div>
        {shown.length ? (
          <ul className="divide-y divide-border border-y border-border">
            {shown.map((course) => (
              <li key={course.id} className="flex flex-wrap items-center gap-4 py-3">
                <CourseCover title={course.title} coverUrl={course.coverUrl} tags={course.tags} className="course-cover-compact w-16 shrink-0 rounded-input" />
                <div className="min-w-0 flex-1">
                  <a href={courseWorkspacePath(actor, course.id)} className="touch-target inline-flex items-center font-medium text-foreground hover:underline">
                    {course.title}
                  </a>
                  <p className="text-sm text-muted">
                    Version {course.contentRevision}, {plural(course.estMinutes, "minute")}
                  </p>
                </div>
                <StatusChip status={course.approvalState} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="check-square"
            title={actor.role === "INSTRUCTOR" ? "Nothing in progress" : "No courses waiting"}
            body={
              actor.role === "INSTRUCTOR"
                ? "Create a draft in My courses, or ask HR to assign you a course."
                : "New submissions and approved revisions will appear here."
            }
          />
        )}
      </section>
    </div>
  );
}
