import { eq, and, isNull } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { WorkspaceLink } from "@/components/workspace-ui";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireRole("HR_HEAD");
  const people = await db
    .select({
      id: t.users.id,
      name: t.users.name,
      employeeId: t.users.employeeId,
    })
    .from(t.users)
    .where(and(eq(t.users.role, "LEARNER"), isNull(t.users.erasedAt)))
    .orderBy(t.users.name);
  return (
    <div>
      <PageHeader
        title="Employees"
        sub="Review employee learning, assign published training, or issue an account reset."
      />
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {people.map((person) => (
          <li key={person.id} className="p-4">
            <WorkspaceLink href={`/team/${person.id}`}>
              {person.name}
            </WorkspaceLink>
            <p className="mt-1 text-sm text-muted">{person.employeeId}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
