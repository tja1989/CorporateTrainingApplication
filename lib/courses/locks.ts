import { sql } from "drizzle-orm";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";

/** Authors hold an exclusive lock; short learning writes share it before course locks. */
export async function lockAssessmentCurriculum(tx: LearningTransaction) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('assessment-curriculum',0))`,
  );
}
export async function lockLearningCurriculum(tx: LearningTransaction) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock_shared(hashtextextended('assessment-curriculum',0))`,
  );
}
