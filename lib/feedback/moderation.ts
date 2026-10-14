import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import type { Actor } from "@/lib/auth/roles";
import { hasPermission } from "@/lib/auth/permissions";
import type { FeedbackKind } from "./types";
import {
  FeedbackConflict,
  feedbackTable,
  freshFeedbackActor,
  lockFeedback,
  savedFeedback,
} from "./service";
export type ModerationInput = {
  kind: FeedbackKind;
  id: string;
  expectedRevision: number;
  hidden: boolean;
  excluded: boolean;
  reason: string;
  requestId: string;
};
export async function moderateFeedback(
  actor: Actor,
  input: ModerationInput,
): Promise<void> {
  if (!hasPermission(actor.role, "feedback.moderate"))
    throw new Error("Not authorized to moderate feedback.");
  if (!["course", "instructor"].includes(input.kind))
    throw new Error("Choose course or instructor feedback.");
  if (!input.reason?.trim() || input.reason.length > 2000)
    throw new Error("Record a reason within 2,000 characters.");
  if (typeof input.hidden !== "boolean" || typeof input.excluded !== "boolean")
    throw new Error("Choose explicit visibility and exclusion values.");
  if (
    !input.requestId?.trim() ||
    input.requestId.length > 160 ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  )
    throw new Error("Use a valid moderation revision and request ID.");
  await db.transaction(async (tx) => {
    await lockFeedback(tx, `request:${input.requestId}`);
    const table = feedbackTable(input.kind);
    const [target] = await tx
      .select()
      .from(table)
      .where(eq(table.id, input.id))
      .limit(1);
    if (!target) throw new Error("Feedback response not found.");
    for (const userId of [...new Set([actor.id, target.employeeId])].sort())
      await lockFeedback(tx, `user:${userId}`);
    await lockFeedback(
      tx,
      `${input.kind}:${target.employeeId}:${target.completionRecordId}`,
    );
    await freshFeedbackActor(actor, tx);
    const [owner] = await tx
      .select()
      .from(t.users)
      .where(eq(t.users.id, target.employeeId))
      .limit(1);
    if (!owner || owner.erasedAt)
      throw new Error("This response belongs to an erased account.");
    const [row] = await tx
      .select()
      .from(table)
      .where(eq(table.id, input.id))
      .limit(1);
    const [replay] = await tx
      .select()
      .from(t.feedbackRevisions)
      .where(eq(t.feedbackRevisions.requestId, input.requestId))
      .limit(1);
    if (replay) {
      if (
        replay.actorId !== actor.id ||
        replay.kind !== input.kind ||
        replay.responseId !== row.id ||
        replay.action !== "moderate" ||
        replay.newHidden !== input.hidden ||
        replay.newExcluded !== input.excluded ||
        replay.reason !== input.reason.trim() ||
        replay.revision !== input.expectedRevision + 1
      )
        throw new Error("This request conflicts with another feedback action.");
      return;
    }
    if (row.revision !== input.expectedRevision)
      throw new FeedbackConflict(savedFeedback(row));
    const revision = row.revision + 1,
      now = new Date();
    await tx
      .update(table)
      .set({
        commentHidden: input.hidden,
        excluded: input.excluded,
        moderationReason: input.reason.trim(),
        revision,
        updatedAt: now,
      })
      .where(eq(table.id, row.id));
    await tx
      .insert(t.feedbackRevisions)
      .values({
        id: id(),
        kind: input.kind,
        responseId: row.id,
        actorId: actor.id,
        action: "moderate",
        revision,
        oldRating: row.rating,
        newRating: row.rating,
        oldComment: row.comment,
        newComment: row.comment,
        oldHidden: row.commentHidden,
        newHidden: input.hidden,
        oldExcluded: row.excluded,
        newExcluded: input.excluded,
        reason: input.reason.trim(),
        requestId: input.requestId,
        at: now,
      });
  });
}
