import { and, eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { canonicalRole, type Actor } from "@/lib/auth/roles";
import type {
  LearningDatabase,
  LearningTransaction,
} from "@/lib/lms/learning-cycle";
import type { FeedbackInput, FeedbackKind, SavedFeedback } from "./types";
import { validateFeedback } from "./validation";
export type FeedbackRow = typeof t.courseFeedback.$inferSelect;
export function feedbackTable(kind: FeedbackKind) {
  return kind === "course" ? t.courseFeedback : t.instructorFeedback;
}
export function savedFeedback(row: FeedbackRow): SavedFeedback {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    revision: row.revision,
    updatedAt: row.updatedAt,
    commentHidden: row.commentHidden,
    excluded: row.excluded,
  };
}
export class FeedbackConflict extends Error {
  constructor(public current: SavedFeedback | null) {
    super(
      "Your feedback changed in another tab. Load the saved response before submitting again.",
    );
  }
}
export async function lockFeedback(tx: LearningTransaction, key: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`feedback:${key}`},0))`,
  );
}
export async function freshFeedbackActor(
  actor: Actor,
  connection: LearningDatabase,
) {
  const [person] = await connection
    .select()
    .from(t.users)
    .where(eq(t.users.id, actor.id))
    .limit(1);
  if (
    !person ||
    person.erasedAt ||
    person.passwordState !== "ACTIVE" ||
    canonicalRole(person.role) !== actor.role
  )
    throw new Error("Your account access changed. Sign in again.");
  return { ...actor, departmentId: person.departmentId };
}
export async function feedbackContext(
  userId: string,
  completionId: string,
  connection: LearningDatabase = db,
) {
  const [completion] = await connection
    .select()
    .from(t.completionRecords)
    .where(
      and(
        eq(t.completionRecords.id, completionId),
        eq(t.completionRecords.userId, userId),
      ),
    )
    .limit(1);
  if (!completion)
    throw new Error(
      "Feedback is available only for your own completed learning cycle.",
    );
  const [delivery] = await connection
    .select()
    .from(t.courseDeliveries)
    .where(eq(t.courseDeliveries.completedRecordId, completionId))
    .limit(1);
  if (delivery && delivery.courseId !== completion.courseId)
    throw new Error("This delivery does not match the completed course.");
  return { completion, delivery: delivery ?? null };
}
export async function ownFeedback(
  userId: string,
  completionId: string,
): Promise<{
  course: SavedFeedback | null;
  instructor: SavedFeedback | null;
  delivery: typeof t.courseDeliveries.$inferSelect | null;
}> {
  const [person] = await db
    .select()
    .from(t.users)
    .where(eq(t.users.id, userId))
    .limit(1);
  if (
    !person ||
    person.erasedAt ||
    person.passwordState !== "ACTIVE" ||
    !canonicalRole(person.role)
  )
    throw new Error("Your account access changed. Sign in again.");
  const { delivery } = await feedbackContext(userId, completionId);
  const [course, instructor] = await Promise.all([
    db
      .select()
      .from(t.courseFeedback)
      .where(
        and(
          eq(t.courseFeedback.employeeId, userId),
          eq(t.courseFeedback.completionRecordId, completionId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(t.instructorFeedback)
      .where(
        and(
          eq(t.instructorFeedback.employeeId, userId),
          eq(t.instructorFeedback.completionRecordId, completionId),
        ),
      )
      .limit(1),
  ]);
  return {
    course: course[0] ? savedFeedback(course[0]) : null,
    instructor: instructor[0] ? savedFeedback(instructor[0]) : null,
    delivery,
  };
}
export async function saveFeedback(
  actor: Actor,
  input: FeedbackInput,
): Promise<SavedFeedback> {
  if (!["course", "instructor"].includes(input.kind))
    throw new Error("Choose course or instructor feedback.");
  const valid = validateFeedback(input.rating, input.comment);
  if (!valid.ok) throw new Error(valid.error);
  if (
    !input.requestId?.trim() ||
    input.requestId.length > 160 ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new Error("Use a valid feedback revision and request ID.");
  return db.transaction(async (tx) => {
    await lockFeedback(tx, `request:${input.requestId}`);
    await lockFeedback(tx, `user:${actor.id}`);
    await lockFeedback(tx, `${input.kind}:${actor.id}:${input.completionId}`);
    await freshFeedbackActor(actor, tx);
    const { completion, delivery } = await feedbackContext(
      actor.id,
      input.completionId,
      tx,
    );
    if (input.kind === "instructor" && !delivery?.instructorId)
      throw new Error(
        "The historical instructor is unknown for this learning cycle.",
      );
    if (input.kind === "instructor" && delivery?.instructorId === actor.id)
      throw new Error("You cannot rate your own instructor performance.");
    const table = feedbackTable(input.kind);
    const [existing] = await tx
      .select()
      .from(table)
      .where(
        and(
          eq(table.employeeId, actor.id),
          eq(table.completionRecordId, completion.id),
        ),
      )
      .limit(1);
    const [replay] = await tx
      .select()
      .from(t.feedbackRevisions)
      .where(eq(t.feedbackRevisions.requestId, input.requestId))
      .limit(1);
    if (replay) {
      if (
        !existing ||
        replay.actorId !== actor.id ||
        replay.kind !== input.kind ||
        replay.responseId !== existing.id ||
        !["create", "edit"].includes(replay.action) ||
        replay.newRating !== valid.rating ||
        replay.newComment !== valid.comment ||
        replay.revision !== input.expectedRevision + 1
      )
        throw new Error("This request conflicts with another feedback action.");
      return {
        id: existing.id,
        revision: replay.revision,
        rating: replay.newRating,
        comment: replay.newComment,
        updatedAt: replay.at,
        commentHidden: existing.commentHidden,
        excluded: existing.excluded,
      };
    }
    if ((existing?.revision ?? 0) !== input.expectedRevision)
      throw new FeedbackConflict(existing ? savedFeedback(existing) : null);
    const now = new Date(),
      responseId = existing?.id ?? id(),
      revision = (existing?.revision ?? 0) + 1;
    const changes = {
      rating: valid.rating,
      comment: valid.comment,
      revision,
      updatedAt: now,
    };
    const base = {
      id: responseId,
      employeeId: actor.id,
      completionRecordId: completion.id,
      courseId: completion.courseId,
      deliveryId: delivery?.id ?? null,
      departmentId: delivery?.departmentId ?? null,
      ...changes,
      createdAt: now,
    };
    let row: FeedbackRow;
    if (existing) {
      [row] = await tx
        .update(table)
        .set(changes)
        .where(eq(table.id, existing.id))
        .returning();
    } else if (input.kind === "course") {
      [row] = await tx.insert(t.courseFeedback).values(base).returning();
    } else {
      [row] = await tx
        .insert(t.instructorFeedback)
        .values({ ...base, instructorId: delivery!.instructorId! })
        .returning();
    }
    await tx.insert(t.feedbackRevisions).values({
      id: id(),
      kind: input.kind,
      responseId,
      actorId: actor.id,
      action: existing ? "edit" : "create",
      revision,
      oldRating: existing?.rating ?? null,
      newRating: valid.rating,
      oldComment: existing?.comment ?? null,
      newComment: valid.comment,
      oldHidden: existing?.commentHidden ?? null,
      newHidden: row.commentHidden,
      oldExcluded: existing?.excluded ?? null,
      newExcluded: row.excluded,
      requestId: input.requestId,
      at: now,
    });
    return savedFeedback(row);
  });
}
