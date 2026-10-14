import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import { availableTraining } from "@/lib/courses/rollout";
import { rolloutAction } from "@/app/(workspace)/hr/rollout/actions";
import { Button, Field, Input, PageHeader, Select, EmptyState } from "./ui";
import { WorkspaceForm } from "./workspace-form";
export async function TrainingRollout({ actor }: { actor: CurrentUser }) {
  const courses = (
    await db.select().from(t.courses).where(eq(t.courses.status, "PUBLISHED"))
  ).filter(
    (c) =>
      c.approvalState === "LEGACY_PUBLISHED" ||
      (c.approvalState === "APPROVED" &&
        c.approvedRevision === c.contentRevision),
  );
  const paths = [] as Array<typeof t.paths.$inferSelect>;
  for (const path of await db.select().from(t.paths)) {
    try {
      await availableTraining({ type: "path", id: path.id });
      paths.push(path);
    } catch {
      /* Incomplete/unavailable paths are not offered. */
    }
  }
  const departments = (await db.select().from(t.departments)).filter(
    (d) => actor.role !== "DEPARTMENT_HEAD" || d.id === actor.departmentId,
  );
  const people = await db
    .select({
      id: t.users.id,
      name: t.users.name,
      employeeId: t.users.employeeId,
      groupIds: t.users.groupIds,
    })
    .from(t.users)
    .where(
      and(
        eq(t.users.role, "LEARNER"),
        eq(t.users.passwordState, "ACTIVE"),
        isNull(t.users.erasedAt),
        actor.role === "DEPARTMENT_HEAD"
          ? actor.departmentId
            ? eq(t.users.departmentId, actor.departmentId)
            : sql`false`
          : undefined,
      ),
    )
    .orderBy(t.users.name);
  const groups = (await db.select().from(t.groups)).filter(
    (g) =>
      actor.role !== "DEPARTMENT_HEAD" ||
      people.some((p) => p.groupIds.includes(g.id)),
  );
  return (
    <div>
      <PageHeader
        title="Training rollout"
        sub={
          actor.role === "DEPARTMENT_HEAD"
            ? "Assign approved training to employees in your department. Group selections include only your department’s employees."
            : "Assign approved training to an employee, department, or job group."
        }
      />
      {!courses.length && !paths.length ? (
        <EmptyState
          icon="book"
          title="No published training available"
          body="HR must publish an approved course before it can be assigned."
        />
      ) : (
        <section
          aria-label="Assign training"
          className="max-w-2xl rounded-card border border-border bg-surface p-4 sm:p-6"
        >
          <WorkspaceForm action={rolloutAction} reload={false}>
            <Field label="Training">
              <Select name="target" defaultValue="" required>
                <option value="" disabled>
                  Choose published training
                </option>
                <optgroup label="Courses">
                  {courses.map((c) => (
                    <option key={c.id} value={`course:${c.id}`}>
                      {c.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Learning paths">
                  {paths.map((p) => (
                    <option key={p.id} value={`path:${p.id}`}>
                      {p.title}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <Field label="Audience">
              <Select name="audience" defaultValue="" required>
                <option value="" disabled>
                  Choose an audience
                </option>
                <optgroup label="Departments">
                  {departments.map((d) => (
                    <option key={d.id} value={`department:${d.id}`}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Employees">
                  {people.map((p) => (
                    <option key={p.id} value={`employee:${p.id}`}>
                      {p.name} ({p.employeeId})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Groups">
                  {groups.map((g) => (
                    <option key={g.id} value={`group:${g.id}`}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <Field
              label="Due in days"
              hint="Calculated at the employee’s store timezone. Existing assignments keep their due date."
            >
              <Input
                name="dueDays"
                type="number"
                min={1}
                max={3650}
                defaultValue={14}
                required
              />
            </Field>
            <Button type="submit">Assign training</Button>
          </WorkspaceForm>
        </section>
      )}
    </div>
  );
}
