import { desc } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import { canReadCourse, courseWorkspacePath } from "@/lib/courses/ownership";
import { hasPermission } from "@/lib/auth/permissions";
import {
  Button,
  Chip,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { WorkspaceForm } from "@/components/workspace-form";
import { WorkspaceSection, WorkspaceLink } from "@/components/workspace-ui";
import { CourseCover } from "@/components/course-cover";
import { createCourseAction } from "@/app/(workspace)/admin/courses/actions";
export const dynamic = "force-dynamic";
export async function CourseCatalog({
  actor,
  searchParams,
}: {
  actor: CurrentUser;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const base = courseWorkspacePath(actor, "_")
    .split("/")
    .slice(0, -1)
    .join("/");
  const author = hasPermission(actor.role, "course.author");
  const departments = await db.select().from(t.departments);
  const instructors = (
    await db
      .select({
        id: t.users.id,
        name: t.users.name,
        role: t.users.role,
        erasedAt: t.users.erasedAt,
        passwordState: t.users.passwordState,
      })
      .from(t.users)
  ).filter(
    (u) =>
      u.role === "INSTRUCTOR" && !u.erasedAt && u.passwordState === "ACTIVE",
  );
  const { q = "", status = "" } = await searchParams;
  const courses = (
    await db.select().from(t.courses).orderBy(desc(t.courses.createdAt))
  ).filter(
    (c) =>
      canReadCourse(actor, c) &&
      (!q || c.title.toLowerCase().includes(q.toLowerCase())) &&
      (!status || c.status === status),
  );
  return (
    <div>
      <PageHeader
        title="Courses"
        sub="Find your courses, review their approval state, and continue the next step."
        actions={
          author ? (
            <WorkspaceLink href="#new-course">Create a course</WorkspaceLink>
          ) : null
        }
      />
      <form
        action={base}
        method="get"
        className="mb-6 grid items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
      >
        <Field label="Search courses">
          <Input name="q" defaultValue={q} />
        </Field>
        <Field label="Publication status">
          <Select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
        <div className="mb-4 flex gap-2">
          <Button type="submit">Apply</Button>
          {q || status ? (
            <WorkspaceLink href={base}>Reset</WorkspaceLink>
          ) : null}
        </div>
      </form>
      <div className={author?"grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]":"min-w-0"}>
        <section aria-label="Course list" className="min-w-0">
          <p className="mb-3 text-sm text-muted">{courses.length} courses</p>
          <div className="divide-y divide-border rounded-card border border-border bg-surface">
            {courses.map((c) => (
              <a
                key={c.id}
                href={`${base}/${c.id}`}
                className="flex min-w-0 flex-wrap items-center gap-4 p-4 hover:bg-surface-2"
              >
                <div className="hidden w-[120px] max-w-full shrink-0 overflow-hidden rounded-input sm:block">
                  <CourseCover
                    title={c.title}
                    tags={c.tags}
                    coverUrl={c.coverUrl}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-semibold text-link">
                    {c.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {c.estMinutes} min · {c.language} ·{" "}
                    {c.approvalState.toLowerCase().replaceAll("_", " ")}
                    {c.certificateEnabled ? " · certificate" : ""}
                  </p>
                  <div className="mt-2">
                    <Chip
                      className="max-w-full [overflow-wrap:anywhere]"
                      variant={
                        c.status === "PUBLISHED"
                          ? "success"
                          : c.status === "DRAFT"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {c.status.toLowerCase()}
                    </Chip>
                  </div>
                </div>
              </a>
            ))}
            {!courses.length ? (
              <p className="p-6 text-sm text-muted">
                No courses match. Reset the filters or create your first course.
              </p>
            ) : null}
          </div>
        </section>
        {author ? (
          <WorkspaceSection
            id="new-course"
            title="New course"
            description="Start with a draft. You can add content before publishing."
          >
            <WorkspaceForm action={createCourseAction}>
              <Field label="Title">
                <Input name="title" required />
              </Field>
              <Field label="Description">
                <Textarea name="description" rows={4} />
              </Field>
              <Field label="Estimated minutes">
                <Input
                  name="estMinutes"
                  type="number"
                  defaultValue={15}
                  min={1}
                  required
                />
              </Field>
              {actor.role !== "INSTRUCTOR" ? (
                <>
                  <Field label="Department">
                    <Select name="departmentId" defaultValue="">
                      <option value="">Unassigned</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Instructor">
                    <Select name="instructorId" defaultValue="">
                      <option value="">Unassigned</option>
                      {instructors.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : null}
              <Button type="submit">Create draft</Button>
            </WorkspaceForm>
          </WorkspaceSection>
        ) : null}
      </div>
    </div>
  );
}
