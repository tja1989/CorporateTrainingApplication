import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { QUESTION_TYPES, type QuestionType } from "./validate";

/** Deeper pages would only make the database skip more rows. */
export const MAX_SEARCH_PAGE = 1000;

export type QuestionSearch = {
  bankId?: string;
  type?: string;
  q?: string;
  authorId?: string;
  page: number;
  pageSize: number;
};
export type QuestionSearchRow = typeof t.questions.$inferSelect & {
  bankName: string | null;
};

/** A 1-based page number from untrusted input, capped at MAX_SEARCH_PAGE. */
export function searchPage(raw: unknown): number {
  return Math.min(MAX_SEARCH_PAGE, Math.max(1, Math.floor(Number(raw)) || 1));
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** APPROVED questions matching every given filter, newest first. An unknown
 * type is ignored. The text search covers the prompt and the scenario. */
export async function searchApprovedQuestions(
  s: QuestionSearch,
): Promise<{ rows: QuestionSearchRow[]; total: number }> {
  const filters: SQL[] = [eq(t.questions.status, "APPROVED")];
  if (s.bankId) filters.push(eq(t.questions.bankId, s.bankId));
  if (s.type && QUESTION_TYPES.includes(s.type as QuestionType))
    filters.push(eq(t.questions.type, s.type as QuestionType));
  if (s.authorId) filters.push(eq(t.questions.authorId, s.authorId));
  const text = s.q?.trim();
  if (text) {
    const pattern = `%${escapeLike(text)}%`;
    filters.push(
      sql`(${t.questions.body}->>'prompt' ILIKE ${pattern} OR ${t.questions.body}->>'stimulus' ILIKE ${pattern})`,
    );
  }
  const where = and(...filters);
  const page = searchPage(s.page);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(t.questions)
    .where(where);
  const rows = await db
    .select({ question: t.questions, bankName: t.questionBanks.name })
    .from(t.questions)
    .leftJoin(t.questionBanks, eq(t.questionBanks.id, t.questions.bankId))
    .where(where)
    .orderBy(desc(t.questions.createdAt), asc(t.questions.id))
    .limit(s.pageSize)
    .offset((page - 1) * s.pageSize);
  return {
    rows: rows.map((row) => ({ ...row.question, bankName: row.bankName })),
    total,
  };
}
