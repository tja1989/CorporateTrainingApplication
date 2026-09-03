import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Button, Card, Chip, Field, Input, PageTitle } from "@/components/ui";
import { createCourseAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CoursesAdminPage() {
  await requireRole("ADMIN");
  const courses = await db.select().from(t.courses).orderBy(desc(t.courses.createdAt));

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Create, edit, and publish courses.">Courses</PageTitle>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {courses.map((c) => (
            <Link key={c.id} href={`/admin/courses/${c.id}`}>
              <Card className="lift pressable flex items-center justify-between gap-3 p-3 text-sm hover:bg-surface-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-xs text-muted">~{c.estMinutes} min · {c.tags.join(", ") || "no tags"}{c.certificateEnabled ? " · certificate" : ""}</p>
                </div>
                <Chip variant={c.status === "PUBLISHED" ? "success" : c.status === "DRAFT" ? "warning" : "neutral"}>{c.status.toLowerCase()}</Chip>
              </Card>
            </Link>
          ))}
        </div>
        <Card className="h-fit p-4">
          <h2 className="eyebrow mb-2 text-muted">New course</h2>
          <form action={createCourseAction}>
            <Field label="Title"><Input name="title" required /></Field>
            <Field label="Description"><Input name="description" /></Field>
            <Field label="Estimated minutes"><Input name="estMinutes" type="number" defaultValue={15} min={1} /></Field>
            <Button type="submit">Create draft</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
