import { and, eq, isNull } from "drizzle-orm";
import { t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import type { LearningTransaction } from "@/lib/lms/learning-cycle";
import type { DeliverySnapshot } from "./types";
export async function snapshotEnrollment(
  tx: LearningTransaction,
  enrollmentId: string,
): Promise<DeliverySnapshot> {
  const [existing] = await tx
    .select()
    .from(t.courseDeliveries)
    .where(eq(t.courseDeliveries.enrollmentId, enrollmentId))
    .limit(1);
  if (existing) return existing;
  const [enrollment] = await tx
    .select()
    .from(t.enrollments)
    .where(eq(t.enrollments.id, enrollmentId))
    .limit(1);
  if (!enrollment) throw new Error("Enrollment not found.");
  const [course] = await tx
    .select()
    .from(t.courses)
    .where(eq(t.courses.id, enrollment.courseId))
    .limit(1);
  if (!course) throw new Error("Course not found.");
  const [created] = await tx
    .insert(t.courseDeliveries)
    .values({
      id: id(),
      enrollmentId,
      courseId: course.id,
      instructorId: course.instructorId,
      departmentId: course.departmentId,
      completedRecordId: null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [winner] = await tx
    .select()
    .from(t.courseDeliveries)
    .where(eq(t.courseDeliveries.enrollmentId, enrollmentId))
    .limit(1);
  return winner;
}
export async function linkCompletionDelivery(
  tx: LearningTransaction,
  enrollmentId: string,
  completionId: string,
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(t.courseDeliveries)
    .where(eq(t.courseDeliveries.enrollmentId, enrollmentId))
    .limit(1);
  if (existing) {
    if (
      existing.completedRecordId &&
      existing.completedRecordId !== completionId
    )
      throw new Error("This delivery already belongs to another completion.");
    await tx
      .update(t.courseDeliveries)
      .set({ completedRecordId: completionId })
      .where(
        and(
          eq(t.courseDeliveries.id, existing.id),
          isNull(t.courseDeliveries.completedRecordId),
        ),
      );
    return;
  }
  const [enrollment] = await tx
    .select()
    .from(t.enrollments)
    .where(eq(t.enrollments.id, enrollmentId))
    .limit(1);
  if (!enrollment) throw new Error("Enrollment not found.");
  // Pre-existing unsnapshotted cycles have no trustworthy historical owner.
  await tx
    .insert(t.courseDeliveries)
    .values({
      id: id(),
      enrollmentId,
      courseId: enrollment.courseId,
      departmentId: null,
      instructorId: null,
      completedRecordId: completionId,
    })
    .onConflictDoNothing()
    .returning();
}
