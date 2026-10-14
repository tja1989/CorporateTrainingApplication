import { and, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { embed } from "@/lib/ai/embeddings";

/**
 * Policy-doc ingestion (spec FR-8.1/8.2): markdown body → heading-based chunks
 * (~512 tokens) with parent-section context; exception clauses stay with their
 * rule (chunk boundaries at headings, never mid-clause). Soft replacement:
 * superseding a version flags old chunks, never deletes them within the audit
 * retention window (answers stay reconstructable, FR-8.11).
 */

export type PolicySection = { path: string; heading: string; text: string };

const approxTokens = (s: string) => Math.ceil(s.split(/\s+/).length / 0.75);

export function sectionizeMarkdown(body: string): PolicySection[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const sections: PolicySection[] = [];
  let h1 = "";
  let h2 = "";
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (!text) return;
    const path = [h1, h2].filter(Boolean).join(" › ") || "Document";
    sections.push({ path, heading: h2 || h1 || "Document", text });
  };

  for (const line of lines) {
    const m1 = line.match(/^#\s+(.*)$/);
    const m2 = line.match(/^##\s+(.*)$/);
    if (m1) {
      flush();
      h1 = m1[1].trim();
      h2 = "";
    } else if (m2) {
      flush();
      h2 = m2[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  // split oversized sections at paragraph boundaries, keeping the section path
  const out: PolicySection[] = [];
  for (const section of sections) {
    if (approxTokens(section.text) <= 512) {
      out.push(section);
      continue;
    }
    const paragraphs = section.text.split(/\n\n+/);
    let acc: string[] = [];
    let part = 1;
    for (const paragraph of paragraphs) {
      acc.push(paragraph);
      if (approxTokens(acc.join("\n\n")) > 400) {
        out.push({ ...section, path: `${section.path} (${part})`, text: acc.join("\n\n") });
        acc = [];
        part++;
      }
    }
    if (acc.length > 0) out.push({ ...section, path: part > 1 ? `${section.path} (${part})` : section.path, text: acc.join("\n\n") });
  }
  return out;
}

export async function ingestPolicyDoc(docId: string): Promise<number> {
  const [doc] = await db.select().from(t.policyDocs).where(eq(t.policyDocs.id, docId)).limit(1);
  if (!doc) throw new Error(`Policy doc ${docId} not found`);

  const sections = sectionizeMarkdown(doc.body);
  if (sections.length === 0) throw new Error("Document produced no sections");
  const vectors = await embed(sections.map((s) => `${doc.title} › ${s.path}\n${s.text}`), "document");

  await db.transaction(async tx => {
    await tx.delete(t.policyChunks).where(eq(t.policyChunks.docId, docId));
    await tx.insert(t.policyChunks).values(sections.map((section, i) => ({
      id: id(),
      docId,
      sectionPath: section.path,
      parentText: section.text.length > 1500 ? "" : sections.filter(x => x.heading === section.heading).map(x => x.text).join("\n\n").slice(0, 4000),
      text: section.text,
      superseded: false,
      embedding: vectors[i],
    })));
  });
  return sections.length;
}

/**
 * Publish a new version of a policy: supersede the old doc + flag (not delete)
 * its chunks, insert + ingest the new one (spec FR-8.1).
 */
export async function publishPolicyVersion(opts: {
  title: string;
  country: string;
  audience: "all" | "managers";
  language: string;
  owner: string;
  effectiveDate: Date;
  body: string;
  isDemo?: boolean;
}): Promise<string> {
  // Prepare external-provider output before replacing a usable version. Failure
  // must leave the old policy and every existing citation reconstructable.
  const sections = sectionizeMarkdown(opts.body);
  if (!sections.length) throw new Error("Add policy content below a heading before publishing.");
  const vectors = await embed(sections.map(s => `${opts.title} › ${s.path}\n${s.text}`), "document");
  if (vectors.length !== sections.length) throw new Error("Policy embeddings are incomplete. Please retry.");
  return db.transaction(async tx => {
  const existing = await tx
    .select()
    .from(t.policyDocs)
    .where(and(eq(t.policyDocs.title, opts.title), eq(t.policyDocs.country, opts.country), eq(t.policyDocs.status, "ACTIVE")));

  let version = 1;
  for (const old of existing) {
    version = Math.max(version, old.version + 1);
    await tx
      .update(t.policyDocs)
      .set({ status: "SUPERSEDED", supersededDate: opts.effectiveDate })
      .where(eq(t.policyDocs.id, old.id));
    await tx.update(t.policyChunks).set({ superseded: true }).where(eq(t.policyChunks.docId, old.id));
  }

  const docId = id();
  await tx.insert(t.policyDocs).values({
    id: docId,
    title: opts.title,
    country: opts.country,
    audience: opts.audience,
    language: opts.language,
    version,
    effectiveDate: opts.effectiveDate,
    owner: opts.owner,
    reviewDue: new Date(opts.effectiveDate.getTime() + 365 * 24 * 3600_000),
    body: opts.body,
    status: "ACTIVE",
    isDemo: opts.isDemo ?? process.env.DEMO_MODE === "true",
  });
  await tx.insert(t.policyChunks).values(sections.map((section, i) => ({
    id: id(), docId, sectionPath: section.path,
    parentText: section.text.length > 1500 ? "" : sections.filter(x => x.heading === section.heading).map(x => x.text).join("\n\n").slice(0,4000),
    text: section.text, superseded: false, embedding: vectors[i],
  })));
  return docId;
  });
}
