// THESIS: waiting work leads each role's workspace.
// OWN-WORLD: use xprtn's existing white/blue surfaces, type and controls.
// STORY: find the course, inspect the revision, take the permitted next action.
// FIRST VIEWPORT: role heading, key destinations, then a real approval queue.
// FORM: an operational queue within the approved application design.
import { desc } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import { canReadCourse, courseWorkspacePath } from "@/lib/courses/ownership";
import { defaultWorkspace, workspaceHome } from "@/lib/auth/roles";
import { ButtonAnchor, Chip, StatusChip, PageHeader, EmptyState } from "./ui";
import { WorkspaceLink } from "./workspace-ui";
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
  return (
    <div>
      <PageHeader title={title} sub={sub} />
      <div className="mb-6 flex flex-wrap gap-3">
        <ButtonAnchor href={`${base}/courses`}>
          {actor.role === "INSTRUCTOR" ? "My courses" : "Course catalog"}
        </ButtonAnchor>
        {actor.role !== "INSTRUCTOR" ? (
          <ButtonAnchor variant="secondary" href={`${base}/rollout`}>
            Roll out training
          </ButtonAnchor>
        ) : null}
        <ButtonAnchor variant="secondary" href={`${base}/reports`}>
          Training reports
        </ButtonAnchor>
      </div>
      {!actor.departmentId && actor.role !== "HR_HEAD" ? (
        <p className="mb-6 rounded-control border border-border bg-surface p-4 text-sm">
          Your account has no department. Ask Super Admin to assign one before
          submitting or approving courses.
        </p>
      ) : null}
      <section aria-label="Courses needing attention">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {actor.role === "HR_HEAD"
              ? "Ready to publish"
              : actor.role === "DEPARTMENT_HEAD"
                ? "Awaiting your review"
                : "Courses in progress"}
          </h2>
          <span className="text-sm text-muted">
            {waiting.length} course{waiting.length === 1 ? "" : "s"}
          </span>
        </div>
        {waiting.length ? (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {waiting.map((course) => (
              <li
                key={course.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <WorkspaceLink href={courseWorkspacePath(actor, course.id)}>
                    {course.title}
                  </WorkspaceLink>
                  <p className="mt-1 text-sm text-muted">
                    Version {course.contentRevision},{" "}
                    {plural(course.estMinutes, "minute")}
                  </p>
                </div>
                <StatusChip status={course.approvalState} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="check-square"
            title="No courses waiting"
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
