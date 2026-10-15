import { desc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { Actor } from "@/lib/auth/roles";
import { id } from "@/lib/ids";
import { canAuthorCourse } from "@/lib/courses/ownership";
import { workflowAction } from "@/app/(workspace)/admin/courses/actions";
import { WorkspaceForm } from "./workspace-form";
import { Button, Chip, Field, Select, Textarea } from "./ui";
import { statusLabel } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
const labels = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting Department Head approval",
  APPROVED: "Approved for publication",
  REJECTED: "Changes requested",
  LEGACY_PUBLISHED: "Published before approvals",
};
export async function CourseWorkflow({
  actor,
  course,
}: {
  actor: Actor;
  course: typeof t.courses.$inferSelect;
}) {
  const events = await db
    .select()
    .from(t.courseWorkflowEvents)
    .where(eq(t.courseWorkflowEvents.courseId, course.id))
    .orderBy(desc(t.courseWorkflowEvents.at));
  const people = events.length
    ? await db
        .select({ id: t.users.id, name: t.users.name })
        .from(t.users)
        .where(inArray(t.users.id, [...new Set(events.map((e) => e.actorId))]))
    : [];
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const author = canAuthorCourse(actor, course),
    draft = course.status === "DRAFT",
    submitted = draft && course.approvalState === "SUBMITTED";
  const approver =
    actor.role === "DEPARTMENT_HEAD" &&
    actor.departmentId === course.departmentId &&
    ![course.createdBy, course.submittedBy, course.instructorId].includes(
      actor.id,
    );
  function Action({
    action,
    label,
    comment = false,
  }: {
    action: string;
    label: string;
    comment?: boolean;
  }) {
    return (
      <WorkspaceForm
        action={workflowAction.bind(null, course.id)}
        className="min-w-0"
      >
        <input type="hidden" name="action" value={action} />
        <input type="hidden" name="revision" value={course.contentRevision} />
        <input type="hidden" name="requestId" value={id()} />
        {comment ? (
          <Field label="Reason for rejection">
            <Textarea name="comment" rows={3} maxLength={2000} required />
          </Field>
        ) : null}
        <Button
          type="submit"
          variant={["reject","archive"].includes(action) ? "secondary" : "primary"}
        >
          {label}
        </Button>
      </WorkspaceForm>
    );
  }
  return (
    <section
      aria-label="Approval workflow"
      className="mb-6 rounded-card border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Approval and publication</h2>
        <Chip
          variant={
            course.approvalState === "APPROVED"
              ? "success"
              : course.approvalState === "REJECTED"
                ? "destructive"
                : "neutral"
          }
        >
          {course.status === "PUBLISHED" && course.approvalState === "APPROVED"
            ? "Published · approved"
            : labels[course.approvalState]}
        </Chip>
      </div>
      <p className="mt-2 mb-4 text-sm text-muted">
        Version {course.contentRevision}. Instructor submits, Department Head
        decides, HR publishes.
      </p>
      <div className="flex flex-wrap items-start gap-4">
        {author &&
        draft &&
        ["DRAFT", "REJECTED"].includes(course.approvalState) ? (
          <Action action="submit" label="Submit for approval" />
        ) : null}
        {author && submitted ? (
          <Action action="withdraw" label="Withdraw submission" />
        ) : null}
        {submitted && approver ? (
          <>
            <Action action="approve" label="Approve course" />
            <Action action="reject" label="Reject with comments" comment />
          </>
        ) : null}
        {actor.role === "HR_HEAD" &&
        ["DRAFT", "ARCHIVED"].includes(course.status) &&
        course.approvalState === "APPROVED" &&
        course.approvedRevision === course.contentRevision ? (
          <Action action="publish" label={course.status === "ARCHIVED" ? "Restore and publish course" : "Publish course"} />
        ) : null}
        {author && course.status === "PUBLISHED" ? (
          <Action action="revise" label="Revise published course" />
        ) : null}
        {["HR_HEAD", "ADMIN"].includes(actor.role) &&
        course.status !== "ARCHIVED" ? (
          <Action action="archive" label="Archive course" />
        ) : null}
      </div>
      {submitted && !approver && actor.role === "DEPARTMENT_HEAD" ? (
        <p className="mt-4 text-sm text-muted">
          Another Department Head must review this submission. Self-approval is
          blocked.
        </p>
      ) : null}
      {actor.role === "ADMIN" ? (
        <details className="mt-5 border-t border-border pt-3">
          <summary className="touch-target flex items-center font-medium text-link">
            Super Admin intervention
          </summary>
          <p className="my-3 text-sm text-muted">
            Record why this course needs an exceptional change. The reason and
            resulting states remain in the audit history.
          </p>
          <WorkspaceForm action={workflowAction.bind(null, course.id)}>
            <input type="hidden" name="action" value="override" />
            <input
              type="hidden"
              name="revision"
              value={course.contentRevision}
            />
            <input type="hidden" name="requestId" value={id()} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Approval state">
                <Select
                  name="overrideState"
                  defaultValue={course.approvalState}
                >
                  {Object.entries(labels)
                    .filter(
                      ([state]) =>
                        state !== "LEGACY_PUBLISHED" ||
                        course.approvalState === "LEGACY_PUBLISHED",
                    )
                    .map(([state, label]) => (
                      <option key={state} value={state}>
                        {label}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Publication state">
                <Select name="overridePublication" defaultValue={course.status}>
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
            </div>
            <Field label="Intervention reason">
              <Textarea name="comment" rows={3} maxLength={2000} required />
            </Field>
            <Button type="submit" variant="secondary">
              Apply recorded intervention
            </Button>
          </WorkspaceForm>
        </details>
      ) : null}
      <details className="mt-5 border-t border-border pt-3">
        <summary className="touch-target flex items-center font-medium">
          Decision history ({events.length})
        </summary>
        {events.length ? (
          <ol className="mt-3 divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="py-3 text-sm">
                <p className="font-medium">
                  {event.action[0].toUpperCase() + event.action.slice(1)} ·
                  revision {event.revision} ·{" "}
                  {nameOf.get(event.actorId) ?? "Former user"}
                </p>
                <p className="mt-1 text-muted">
                  {formatDateTime(event.at)}{" "}
                  · {statusLabel(event.toState).label},{" "}
                  {statusLabel(event.toPublication).label.toLowerCase()}
                </p>
                {event.comment ? (
                  <p className="mt-2 whitespace-pre-wrap break-words">
                    {event.comment}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted">No decisions yet.</p>
        )}
      </details>
    </section>
  );
}
