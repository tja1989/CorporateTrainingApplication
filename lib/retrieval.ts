import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { embed, embeddingsAvailable } from "@/lib/ai/embeddings";

/**
 * Hybrid retrieval (spec §9.2): vector KNN and full-text run in parallel,
 * merged with Reciprocal Rank Fusion (k=60). Scope filters applied in SQL
 * BEFORE ranking, never after.
 */

const RRF_K = 60;

export function rrfMerge<Id extends string>(rankings: Id[][]): Array<{ id: Id; score: number }> {
  const scores = new Map<Id, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1));
    });
  }
  return [...scores.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

export type VideoChunkHit = {
  id: string;
  videoId: string;
  startSec: number;
  endSec: number;
  text: string;
  score: number;
};

export async function searchVideoChunks(query: string, scope: { videoId?: string; videoIds?: string[] }, topK = 10): Promise<VideoChunkHit[]> {
  const [qVec] = await embed([query], "query");
  const vecLiteral = `[${qVec.join(",")}]`;
  const scopeSql = scope.videoId
    ? sql`video_id = ${scope.videoId}`
    : scope.videoIds && scope.videoIds.length > 0
      ? sql`video_id IN (${sql.join(scope.videoIds.map((v) => sql`${v}`), sql`, `)})`
      : sql`true`;

  const vecRows = (await db.execute(sql`
    SELECT id FROM video_chunks
    WHERE ${scopeSql} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT 20
  `)) as unknown as { rows: Array<{ id: string }> };

  const ftsRows = (await db.execute(sql`
    SELECT id FROM video_chunks
    WHERE ${scopeSql} AND to_tsvector('english', text) @@ replace(plainto_tsquery('english', ${query})::text, '&', '|')::tsquery
    ORDER BY ts_rank_cd(to_tsvector('english', text), replace(plainto_tsquery('english', ${query})::text, '&', '|')::tsquery) DESC
    LIMIT 20
  `)) as unknown as { rows: Array<{ id: string }> };

  const ftsIds = ftsRows.rows.map((r) => r.id);
  // mock embeddings are lexical noise — weight the FTS ranking double offline
  const rankings = embeddingsAvailable()
    ? [vecRows.rows.map((r) => r.id), ftsIds]
    : [vecRows.rows.map((r) => r.id), ftsIds, ftsIds];
  const merged = rrfMerge(rankings).slice(0, topK);
  if (merged.length === 0) return [];
  const ids = merged.map((m) => m.id);
  const rows = (await db.execute(sql`
    SELECT id, video_id, start_sec, end_sec, text FROM video_chunks
    WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `)) as unknown as { rows: Array<{ id: string; video_id: string; start_sec: number; end_sec: number; text: string }> };
  const byId = new Map(rows.rows.map((r) => [r.id, r]));
  return merged
    .map((m) => {
      const r = byId.get(m.id);
      return r
        ? { id: r.id, videoId: r.video_id, startSec: r.start_sec, endSec: r.end_sec, text: r.text, score: m.score }
        : null;
    })
    .filter((x): x is VideoChunkHit => !!x);
}

export type PolicyChunkHit = {
  id: string;
  docId: string;
  sectionPath: string;
  text: string;
  parentText: string;
  score: number;
  ftsMatched: boolean;
};

/**
 * Policy retrieval with hard metadata filters (spec FR-8.5): country, audience,
 * effective window, superseded — all in SQL before ranking.
 */
export async function searchPolicyChunks(
  query: string,
  scope: { country: string; audience: "all" | "managers" },
  topK = 8,
): Promise<PolicyChunkHit[]> {
  const [qVec] = await embed([query], "query");
  const vecLiteral = `[${qVec.join(",")}]`;
  const audienceSql = scope.audience === "managers" ? sql`d.audience IN ('all','managers')` : sql`d.audience = 'all'`;
  const filterSql = sql`
    pc.superseded = false
    AND d.status = 'ACTIVE'
    AND d.country = ${scope.country}
    AND ${audienceSql}
    AND d.effective_date <= now()
    AND (d.superseded_date IS NULL OR d.superseded_date > now())
  `;

  const vecRows = (await db.execute(sql`
    SELECT pc.id FROM policy_chunks pc JOIN policy_docs d ON d.id = pc.doc_id
    WHERE ${filterSql} AND pc.embedding IS NOT NULL
    ORDER BY pc.embedding <=> ${vecLiteral}::vector
    LIMIT 16
  `)) as unknown as { rows: Array<{ id: string }> };

  const ftsRows = (await db.execute(sql`
    SELECT pc.id FROM policy_chunks pc JOIN policy_docs d ON d.id = pc.doc_id
    WHERE ${filterSql} AND to_tsvector('english', pc.text) @@ replace(plainto_tsquery('english', ${query})::text, '&', '|')::tsquery
    ORDER BY ts_rank_cd(to_tsvector('english', pc.text), replace(plainto_tsquery('english', ${query})::text, '&', '|')::tsquery) DESC
    LIMIT 16
  `)) as unknown as { rows: Array<{ id: string }> };

  const ftsIds = ftsRows.rows.map((r) => r.id);
  const ftsSet = new Set(ftsIds);
  const rankings = embeddingsAvailable()
    ? [vecRows.rows.map((r) => r.id), ftsIds]
    : [vecRows.rows.map((r) => r.id), ftsIds, ftsIds];
  const merged = rrfMerge(rankings).slice(0, topK);
  if (merged.length === 0) return [];
  const ids = merged.map((m) => m.id);
  const rows = (await db.execute(sql`
    SELECT id, doc_id, section_path, text, parent_text FROM policy_chunks
    WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `)) as unknown as { rows: Array<{ id: string; doc_id: string; section_path: string; text: string; parent_text: string }> };
  const byId = new Map(rows.rows.map((r) => [r.id, r]));
  return merged
    .map((m) => {
      const r = byId.get(m.id);
      return r
        ? {
            id: r.id,
            docId: r.doc_id,
            sectionPath: r.section_path,
            text: r.text,
            parentText: r.parent_text,
            score: m.score,
            ftsMatched: ftsSet.has(r.id),
          }
        : null;
    })
    .filter((x): x is PolicyChunkHit => !!x);
}
