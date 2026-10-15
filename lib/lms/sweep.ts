import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { computeComplianceStatus } from "./compliance";
import { enrollUser } from "./rules";
import { notify } from "@/lib/notify";
import { daysUntil, localDate } from "@/lib/time";
import { canonicalRole } from "@/lib/auth/roles";
import { isCourseAvailable } from "@/lib/courses/availability";
import { lockAssessmentCurriculum } from "@/lib/courses/workflow";
import { trainingScope } from "@/lib/auth/scope";
import { enrollmentDeadline } from "@/lib/courses/planning";

/**
 * Nightly sweep (spec FR-3.3/3.4/3.5, FR-13.3): compliance recompute, reminder
 * ladder, recert trigger, manager digests (weekly), retention purge.
 * Idempotent per local day via notification dedupe keys.
 */
export async function runDailySweep(
  now = new Date(),
): Promise<Record<string, number>> {
  const stats: Record<string, number> = {
    reminders: 0,
    recerts: 0,
    recomputed: 0,
    purged: 0,
  };
  const today = localDate(now);

  // ---- 1) Recompute compliance status on all non-terminal enrollments
  const open = await db
    .select()
    .from(t.enrollments)
    .where(
      inArray(t.enrollments.status, [
        "NOT_STARTED",
        "IN_PROGRESS",
        "COMPLETED",
      ]),
    );
  const certRows = await db.select().from(t.certificates);
  certRows.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());

  for (const e of open) {
    const cert = e.completedAt
      ? certRows.find(
          (c) =>
            c.userId === e.userId &&
            c.courseId === e.courseId &&
            c.issuedAt <= e.completedAt!,
        )
      : undefined;
    const next = computeComplianceStatus({
      status: e.status,
      dueAt: e.dueAt,
      certificateExpiresAt: cert?.expiresAt ?? null,
      now,
    });
    if (next !== e.complianceStatus) {
      await db
        .update(t.enrollments)
        .set({ complianceStatus: next })
        .where(eq(t.enrollments.id, e.id));
      stats.recomputed++;
    }

    // ---- 2) Reminder ladder: 7/3/1, due today, weekly overdue
    if (e.dueAt && (e.status === "NOT_STARTED" || e.status === "IN_PROGRESS")) {
      const days = daysUntil(e.dueAt, now);
      const [course] = await db
        .select()
        .from(t.courses)
        .where(eq(t.courses.id, e.courseId))
        .limit(1);
      const title = course?.title ?? "Course";
      if (days === 7 || days === 3 || days === 1) {
        await notify(
          e.userId,
          "due_soon",
          { courseTitle: title, days, courseId: e.courseId },
          `due_soon:${e.id}:${days}`,
        );
        stats.reminders++;
      } else if (days === 0) {
        await notify(
          e.userId,
          "due_today",
          { courseTitle: title, courseId: e.courseId },
          `due_today:${e.id}`,
        );
        stats.reminders++;
      } else if (days < 0 && Math.abs(days) % 7 === 0) {
        await notify(
          e.userId,
          "overdue",
          { courseTitle: title, courseId: e.courseId },
          `overdue:${e.id}:${today}`,
        );
        stats.reminders++;
      }
    }
  }

  // ---- 3) Recert trigger: expiring certificates → re-enrollment with due = expiry
  const certs = await db
    .select({ id: t.certificates.id })
    .from(t.certificates)
    .where(isNull(t.certificates.recertTriggeredAt));
  for (const cert of certs)
    if (await tryCertificateRenewal(cert.id, now)) stats.recerts++;

  // ---- 4) Retention purge (spec FR-13.3 maximums)
  stats.purged += await purge(now);
  return stats;
}

/** One idempotent renewal, shared by the nightly sweep and targeted retry operations. */
export async function tryCertificateRenewal(
  certificateId: string,
  now = new Date(),
): Promise<boolean> {
  const afterCommit: Array<() => Promise<void>> = [];
  const created = await db.transaction(async (tx) => {
    await lockAssessmentCurriculum(tx);
    const [current] = await tx
      .select()
      .from(t.certificates)
      .where(eq(t.certificates.id, certificateId))
      .limit(1);
    if (
      !current ||
      current.recertTriggeredAt ||
      !current.expiresAt ||
      current.kind !== "internal"
    )
      return false;
    const [course] = await tx
      .select()
      .from(t.courses)
      .where(eq(t.courses.id, current.courseId))
      .limit(1);
    if (!course || !isCourseAvailable(course)) return false;
    try {
      enrollmentDeadline(course, current.expiresAt);
    } catch {
      return false;
    }
    const lead = course.recertLeadDays ?? 30;
    if (current.expiresAt.getTime() - now.getTime() > lead * 86400000)
      return false;
    const n = await enrollUser(
      current.userId,
      { type: "course", id: current.courseId },
      "recert",
      current.id,
      current.expiresAt,
      tx,
    );
    await tx
      .update(t.certificates)
      .set({ recertTriggeredAt: now })
      .where(eq(t.certificates.id, current.id));
    if (n)
      await notify(
        current.userId,
        "cert_expiring",
        {
          courseTitle: course.title,
          days: Math.max(0, daysUntil(current.expiresAt, now)),
          courseId: course.id,
        },
        `cert_expiring:${current.id}`,
        undefined,
        { connection: tx, afterCommit },
      );
    return n > 0;
  });
  await Promise.allSettled(afterCommit.map((deliver) => deliver()));
  return created;
}

/** Weekly manager digest incl. the not-reached-directly list (spec FR-3.4). */
export async function runWeeklyDigest(now = new Date()): Promise<number> {
  const managers = await db
    .select()
    .from(t.users)
    .where(
      and(
        inArray(t.users.role, ["MANAGER", "DEPARTMENT_HEAD", "ADMIN"]),
        isNull(t.users.erasedAt),
      ),
    );
  let sent = 0;
  for (const manager of managers) {
    const role = canonicalRole(manager.role)!;
    const scope =
      role === "DEPARTMENT_HEAD"
        ? await trainingScope({
            id: manager.id,
            role,
            departmentId: manager.departmentId,
          })
        : null;
    const team = await db
      .select()
      .from(t.users)
      .where(
        and(
          isNull(t.users.erasedAt),
          scope
            ? scope.userIds?.length
              ? inArray(t.users.id, scope.userIds)
              : sql`false`
            : eq(t.users.managerId, manager.id),
        ),
      );
    if (team.length === 0) continue;
    const teamIds = team.map((u) => u.id);
    const problem = await db
      .select()
      .from(t.enrollments)
      .where(
        and(
          inArray(t.enrollments.userId, teamIds),
          inArray(t.enrollments.complianceStatus, ["OVERDUE", "DUE_SOON"]),
        ),
      );
    if (problem.length === 0) continue;
    const overdue = problem.filter(
      (p) => p.complianceStatus === "OVERDUE",
    ).length;
    const dueSoon = problem.length - overdue;
    // not reached directly: no email + no app open in 7 days (proxy: no ui_events)
    const cutoff = new Date(now.getTime() - 7 * 24 * 3600_000);
    const seen = await db
      .select({ userId: t.uiEvents.userId })
      .from(t.uiEvents)
      .where(
        and(
          inArray(t.uiEvents.userId, teamIds),
          sql`${t.uiEvents.ts} > ${cutoff}`,
        ),
      );
    const seenIds = new Set(seen.map((s) => s.userId));
    const unreached = team.filter(
      (u) =>
        !u.email &&
        !seenIds.has(u.id) &&
        problem.some((p) => p.userId === u.id),
    );
    const summary =
      `${overdue} overdue and ${dueSoon} due-soon item(s) on your team. ` +
      (unreached.length > 0
        ? `Not reached directly (no email, inactive 7d) — nudge in person: ${unreached.map((u) => u.name).join(", ")}.`
        : "Everyone with open items has been reached in-app.");
    await notify(
      manager.id,
      "manager_digest",
      { summary },
      `digest:${manager.id}:${localDate(now)}`,
    );
    sent++;
  }
  return sent;
}

/** Retention maximums (spec FR-13.3). Returns rows deleted. */
export async function purge(now = new Date()): Promise<number> {
  const d = (days: number) => new Date(now.getTime() - days * 24 * 3600_000);
  let total = 0;
  const del = async (result: { rowCount?: number | null } | unknown[]) =>
    Array.isArray(result)
      ? result.length
      : ((result as { rowCount?: number | null }).rowCount ?? 0);

  total += await del(
    await db.delete(t.hrAuditLog).where(lt(t.hrAuditLog.ts, d(365))),
  );
  total += await del(
    await db.delete(t.hrMessages).where(lt(t.hrMessages.createdAt, d(365))),
  );
  total += await del(
    await db
      .delete(t.tutorMessages)
      .where(lt(t.tutorMessages.createdAt, d(365))),
  );
  total += await del(
    await db
      .delete(t.liveInterviews)
      .where(lt(t.liveInterviews.startedAt, d(365))),
  );
  // voice sessions that never posted an end (closed tab, lost device): abandon after an hour
  await db
    .update(t.liveInterviews)
    .set({ state: "ABANDONED", completedAt: now })
    .where(
      and(
        eq(t.liveInterviews.state, "IN_PROGRESS"),
        lt(t.liveInterviews.startedAt, new Date(now.getTime() - 3600_000)),
      ),
    );
  // integrity events: 6 months after attempt finalization
  const oldEvents = await db
    .select({
      id: t.integrityEvents.id,
      attemptId: t.integrityEvents.attemptId,
    })
    .from(t.integrityEvents)
    .where(lt(t.integrityEvents.ts, d(180)));
  if (oldEvents.length > 0) {
    const finalized = await db
      .select({ id: t.attempts.id })
      .from(t.attempts)
      .where(inArray(t.attempts.state, ["GRADED", "CLEARED", "VOIDED"]));
    const finalizedIds = new Set(finalized.map((a) => a.id));
    const purgeable = oldEvents
      .filter((e) => finalizedIds.has(e.attemptId))
      .map((e) => e.id);
    if (purgeable.length > 0) {
      total += await del(
        await db
          .delete(t.integrityEvents)
          .where(inArray(t.integrityEvents.id, purgeable)),
      );
    }
  }
  // raw watch buckets: 90 days (aggregate % survives via lesson completion status)
  const staleProgress = await db
    .select()
    .from(t.lessonProgress)
    .where(
      and(
        lt(t.lessonProgress.updatedAt, d(90)),
        sql`${t.lessonProgress.watchedBuckets} IS NOT NULL`,
      ),
    );
  for (const p of staleProgress) {
    await db
      .update(t.lessonProgress)
      .set({ watchedBuckets: null })
      .where(eq(t.lessonProgress.id, p.id));
    total++;
  }
  total += await del(
    await db.delete(t.aiCallLog).where(lt(t.aiCallLog.ts, d(730))),
  );
  total += await del(
    await db.delete(t.loginAttempts).where(lt(t.loginAttempts.at, d(30))),
  );
  return total;
}
