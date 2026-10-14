import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { Markdown, slugify } from "@/lib/markdown";
import { Card, Chip, PageTitle } from "@/components/ui";
import { ScrollToSection } from "./scroll";

export const dynamic = "force-dynamic";

/** Policy viewer — citations open here scrolled to the section (spec FR-8.4, §11.8a). */
export default async function PolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ docId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await requireUser();
  const { docId } = await params;
  const { section } = await searchParams;
  const [doc] = await db.select().from(t.policyDocs).where(eq(t.policyDocs.id, docId)).limit(1);
  if (!doc) notFound();
  if (doc.audience === "managers" && user.role === "LEARNER") notFound();

  const anchor = section ? slugify(section.split("›").pop()?.replace(/\(\d+\)\s*$/, "").trim() ?? "") : null;

  return (
    <div className="mx-auto max-w-3xl">
      {anchor ? <ScrollToSection anchor={anchor} /> : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PageTitle>{doc.title}</PageTitle>
        <Chip variant={doc.status === "ACTIVE" ? "success" : "destructive"}>
          {doc.status === "ACTIVE" ? `v${doc.version} · effective ${doc.effectiveDate.toISOString().slice(0, 10)}` : "Superseded"}
        </Chip>
        {doc.isDemo ? <Chip variant="warning">DEMO — fictional handbook</Chip> : null}
      </div>
      {section ? <p className="mb-4 text-sm text-muted">Cited section: <a href={`#${anchor}`} className="text-link underline">{section}</a></p> : null}
      <Card className="p-5 sm:p-8">
        <Markdown text={doc.body} headingOffset={1} highlightAnchor={anchor} />
      </Card>
      <p className="mt-3 text-xs text-muted">
        Policy owner: {doc.owner || "HR"} · Only the HR team makes final determinations.
      </p>
    </div>
  );
}
