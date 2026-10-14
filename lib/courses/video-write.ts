import { eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";
import { lockCurriculum } from "./workflow";
export type VideoDraftBinding = { courseId: string; revision: number };
/** External fetching/embedding happens outside this short write transaction. */
export async function withDraftVideoWrite<T>(
  videoId: string,
  binding: VideoDraftBinding | undefined,
  run: (tx: LearningTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const references = await tx
      .select({ courseId: t.modules.courseId })
      .from(t.lessons)
      .innerJoin(t.modules, eq(t.lessons.moduleId, t.modules.id))
      .where(sql`${t.lessons.payload}->>'videoId'=${videoId}`);
    const courseIds = [...new Set(references.map((r) => r.courseId))].sort();
    if (binding && !courseIds.includes(binding.courseId))
      throw new Error(
        "The video is no longer attached to its authorized draft.",
      );
    for (const courseId of courseIds) {
      await lockCurriculum(tx, courseId);
      const [course] = await tx
        .select()
        .from(t.courses)
        .where(eq(t.courses.id, courseId))
        .limit(1);
      if (
        !course ||
        course.status !== "DRAFT" ||
        ["SUBMITTED", "APPROVED"].includes(course.approvalState)
      )
        throw new Error(
          "Video content is locked by a submitted, approved or published course.",
        );
      if (
        binding?.courseId === courseId &&
        binding.revision !== course.contentRevision
      )
        throw new Error(
          "The draft revision changed. Retry ingestion from the current course.",
        );
    }
    return run(tx);
  });
}
