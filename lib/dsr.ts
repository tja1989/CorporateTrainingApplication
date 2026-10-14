import { and, eq, inArray, or } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { lockFeedback } from "@/lib/feedback/service";
import { pseudoId } from "@/lib/hr/assistant";

/** Data-subject rights (spec FR-13.4): full export; erasure keeps statutory training records, pseudonymized. */

export async function exportUserData(
  userId: string,
): Promise<Record<string, unknown>> {
  const [user] = await db
    .select()
    .from(t.users)
    .where(eq(t.users.id, userId))
    .limit(1);
  if (!user) throw new Error("User not found");
  const [
    enrollments,
    progress,
    completions,
    certs,
    attempts,
    drill,
    streaks,
    points,
    badgeRows,
    notificationsRows,
    tutorThreadRows,
    hrConvs,
    tickets,
    consents,
    events,
    interviews,
  ] = await Promise.all([
    db.select().from(t.enrollments).where(eq(t.enrollments.userId, userId)),
    db
      .select()
      .from(t.lessonProgress)
      .where(eq(t.lessonProgress.userId, userId)),
    db
      .select()
      .from(t.completionRecords)
      .where(eq(t.completionRecords.userId, userId)),
    db.select().from(t.certificates).where(eq(t.certificates.userId, userId)),
    db.select().from(t.attempts).where(eq(t.attempts.userId, userId)),
    db.select().from(t.drillState).where(eq(t.drillState.userId, userId)),
    db.select().from(t.streakState).where(eq(t.streakState.userId, userId)),
    db.select().from(t.pointsLedger).where(eq(t.pointsLedger.userId, userId)),
    db.select().from(t.badges).where(eq(t.badges.userId, userId)),
    db.select().from(t.notifications).where(eq(t.notifications.userId, userId)),
    db.select().from(t.tutorThreads).where(eq(t.tutorThreads.userId, userId)),
    db
      .select()
      .from(t.hrConversations)
      .where(eq(t.hrConversations.userId, userId)),
    db.select().from(t.hrTickets).where(eq(t.hrTickets.userId, userId)),
    db.select().from(t.consents).where(eq(t.consents.userId, userId)),
    db.select().from(t.uiEvents).where(eq(t.uiEvents.userId, userId)),
    db
      .select()
      .from(t.liveInterviews)
      .where(eq(t.liveInterviews.userId, userId)),
  ]);
  const threadMessages = [] as unknown[];
  for (const thread of tutorThreadRows) {
    threadMessages.push(
      ...(await db
        .select()
        .from(t.tutorMessages)
        .where(eq(t.tutorMessages.threadId, thread.id))),
    );
  }
  const hrMessagesRows = [] as unknown[];
  for (const conv of hrConvs) {
    hrMessagesRows.push(
      ...(await db
        .select()
        .from(t.hrMessages)
        .where(eq(t.hrMessages.conversationId, conv.id))),
    );
  }
  const [courseFeedback, instructorFeedback] = await Promise.all([
    db
      .select()
      .from(t.courseFeedback)
      .where(eq(t.courseFeedback.employeeId, userId)),
    db
      .select()
      .from(t.instructorFeedback)
      .where(eq(t.instructorFeedback.employeeId, userId)),
  ]);
  const ownedRevisions = or(
    courseFeedback.length
      ? and(
          eq(t.feedbackRevisions.kind, "course"),
          inArray(
            t.feedbackRevisions.responseId,
            courseFeedback.map((r) => r.id),
          ),
        )
      : undefined,
    instructorFeedback.length
      ? and(
          eq(t.feedbackRevisions.kind, "instructor"),
          inArray(
            t.feedbackRevisions.responseId,
            instructorFeedback.map((r) => r.id),
          ),
        )
      : undefined,
  );
  const feedbackRevisions = ownedRevisions
    ? await db.select().from(t.feedbackRevisions).where(ownedRevisions)
    : [];
  const { passwordHash, inviteCodeHash, totpSecret, ...profile } = user;
  void passwordHash;
  void inviteCodeHash;
  void totpSecret;
  return {
    exportedAt: new Date().toISOString(),
    courseFeedback,
    instructorFeedback,
    feedbackRevisions,
    profile,
    enrollments,
    lessonProgress: progress,
    completionRecords: completions,
    certificates: certs,
    attempts,
    drillState: drill,
    streaks,
    points,
    badges: badgeRows,
    notifications: notificationsRows,
    tutorThreads: tutorThreadRows,
    tutorMessages: threadMessages,
    hrConversations: hrConvs,
    hrMessages: hrMessagesRows,
    hrTickets: tickets,
    consents,
    uiEvents: events,
    oralChecks: interviews,
    note:
      "HR audit-log rows are stored pseudonymously under id " +
      pseudoId(userId),
  };
}

export async function eraseUser(userId: string): Promise<void> {
  return db.transaction(async (connection) => {
    await lockFeedback(connection, `user:${userId}`);
    const [user] = await connection
      .select()
      .from(t.users)
      .where(eq(t.users.id, userId))
      .limit(1);
    if (!user) return;
    const [courseFeedback, instructorFeedback] = await Promise.all([
      connection
        .select()
        .from(t.courseFeedback)
        .where(eq(t.courseFeedback.employeeId, userId)),
      connection
        .select()
        .from(t.instructorFeedback)
        .where(eq(t.instructorFeedback.employeeId, userId)),
    ]);
    const ownedRevisions = or(
      courseFeedback.length
        ? and(
            eq(t.feedbackRevisions.kind, "course"),
            inArray(
              t.feedbackRevisions.responseId,
              courseFeedback.map((r) => r.id),
            ),
          )
        : undefined,
      instructorFeedback.length
        ? and(
            eq(t.feedbackRevisions.kind, "instructor"),
            inArray(
              t.feedbackRevisions.responseId,
              instructorFeedback.map((r) => r.id),
            ),
          )
        : undefined,
    );
    for (const table of [t.courseFeedback, t.instructorFeedback])
      await connection
        .update(table)
        .set({ comment: "", moderationReason: "", commentHidden: true })
        .where(eq(table.employeeId, userId));
    if (ownedRevisions)
      await connection
        .update(t.feedbackRevisions)
        .set({ oldComment: null, newComment: "", reason: "" })
        .where(ownedRevisions);
    // Remove private reasons authored by this person without altering other authors' comments.
    await connection
      .update(t.feedbackRevisions)
      .set({ reason: "" })
      .where(eq(t.feedbackRevisions.actorId, userId));
    // delete personal-content data
    const threads = await connection
      .select()
      .from(t.tutorThreads)
      .where(eq(t.tutorThreads.userId, userId));
    for (const thread of threads)
      await connection
        .delete(t.tutorMessages)
        .where(eq(t.tutorMessages.threadId, thread.id));
    await connection
      .delete(t.tutorThreads)
      .where(eq(t.tutorThreads.userId, userId));
    const convs = await connection
      .select()
      .from(t.hrConversations)
      .where(eq(t.hrConversations.userId, userId));
    for (const conv of convs)
      await connection
        .delete(t.hrMessages)
        .where(eq(t.hrMessages.conversationId, conv.id));
    await connection
      .delete(t.hrConversations)
      .where(eq(t.hrConversations.userId, userId));
    await connection
      .delete(t.liveInterviews)
      .where(eq(t.liveInterviews.userId, userId));
    await connection
      .delete(t.notifications)
      .where(eq(t.notifications.userId, userId));
    await connection
      .delete(t.drillState)
      .where(eq(t.drillState.userId, userId));
    await connection
      .delete(t.streakState)
      .where(eq(t.streakState.userId, userId));
    await connection.delete(t.uiEvents).where(eq(t.uiEvents.userId, userId));
    await connection
      .delete(t.pointsLedger)
      .where(eq(t.pointsLedger.userId, userId));
    await connection.delete(t.badges).where(eq(t.badges.userId, userId));
    await connection
      .delete(t.loginAttempts)
      .where(eq(t.loginAttempts.key, user.employeeId));
    // pseudonymize the profile; completion records and certificates stay (statutory)
    await db
      .update(t.users)
      .set({
        name: "Former colleague",
        employeeId: `ERASED-${userId.slice(0, 8).toUpperCase()}`,
        email: null,
        passwordHash: null,
        passwordState: "INVITED",
        inviteCodeHash: null,
        totpSecret: null,
        jobTitle: null,
        quietHours: null,
        erasedAt: new Date(),
      })
      .where(eq(t.users.id, userId));
  });
}
