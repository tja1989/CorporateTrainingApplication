import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { computeComplianceStatus } from "./compliance";
import { enrollUser } from "./rules";
import { notify } from "@/lib/notify";
import { daysUntil, localDate } from "@/lib/time";

/**
 * Nightly sweep (spec FR-3.3/3.4/3.5, FR-13.3): compliance recompute, reminder
 * ladder, recert trigger, manager digests (weekly), retention purge.
 * Idempotent per local day via notification dedupe keys.
 */
export async function runDailySweep(now = new Date()): Promise<Record<string, number>> {
  const stats: Record<string, number> = { reminders: 0, recerts: 0, recomputed: 0, purged: 0 };
  const today = localDate(now);

  // ---- 1) Recompute compliance status on all non-terminal enrollments
  const open = await db
    .select()
    .from(t.enrollments)
    .where(inArray(t.enrollments.status, ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]));
  const certRows = await db.select().from(t.certificates);
  const certByUserCourse = new Map(certRows.map((c) => [`${c.userId}:${c.courseId}`, c]));

  for (const e of open) {
    const cert = certByUserCourse.get(`${e.userId}:${e.courseId}`);
    const next = computeComplianceStatus({
      status: e.status,
      dueAt: e.dueAt,
      certificateExpiresAt: cert?.expiresAt ?? null,
      now,
    });
    if (next !== e.complianceStatus) {
      await db.update(t.enrollments).set({ complianceStatus: next }).where(eq(t.enrollments.id, e.id));
      stats.recomputed++;
    }

    // ---- 2) Reminder ladder: 7/3/1, due today, weekly overdue
    if (e.dueAt && (e.status === "NOT_STARTED" || e.status === "IN_PROGRESS")) {
      const days = daysUntil(e.dueAt, now);
      const [course] = await db.select().from(t.courses).where(eq(t.courses.id, e.courseId)).limit(1);
      const title = course?.title ?? "Course";
      if (days === 7 || days === 3 || days === 1) {
        await notify(e.userId, "due_soon", { courseTitle: title, days, courseId: e.courseId }, `due_soon:${e.id}:${days}`);
        stats.reminders++;
      } else if (days === 0) {
        await notify(e.userId, "due_today", { courseTitle: title, courseId: e.courseId }, `due_today:${e.id}`);
        stats.reminders++;
      } else if (days < 0 && Math.abs(days) % 7 === 0) {
        await notify(e.userId, "overdue", { courseTitle: title, courseId: e.courseId }, `overdue:${e.id}:${today}`);
        stats.reminders++;
      }
    }
  }

  // ---- 3) Recert trigger: expiring certificates → re-enrollment with due = expiry
  const certs = await db.select().from(t.certificates).where(isNull(t.certificates.recertTriggeredAt));
  for (const cert of certs) {
    if (!cert.expiresAt || cert.kind !== "internal") continue;
    const [course] = await db.select().from(t.courses).where(eq(t.courses.id, cert.courseId)).limit(1);
    if (!course) continue;
    const lead = course.recertLeadDays ?? 30;
    if (cert.expiresAt.getTime() - now.getTime() <= lead * 24 * 3600_000) {
      const n = await enrollUser(cert.userId, { type: "course", id: cert.courseId }, "recert", cert.id, cert.expiresAt);
      await db.update(t.certificates).set({ recertTriggeredAt: now }).where(eq(t.certificates.id, cert.id));
      if (n > 0) {
        await notify(
          cert.userId,
          "cert_expiring",
          { courseTitle: course.title, days: Math.max(0, daysUntil(cert.expiresAt, now)), courseId: course.id },
          `cert_expiring:${cert.id}`,
        );
        stats.recerts++;
      }
    }
  }

  // ---- 4) Retention purge (spec FR-13.3 maximums)
  stats.purged += await purge(now);
  return stats;
}

/** Weekly manager digest incl. the not-reached-directly list (spec FR-3.4). */
export async function runWeeklyDigest(now = new Date()): Promise<number> {
  const managers = await db.select().from(t.users).where(inArray(t.users.role, ["MANAGER", "ADMIN"]));
  let sent = 0;
  for (const manager of managers) {
    const team = await db.select().from(t.users).where(eq(t.users.managerId, manager.id));
    if (team.length === 0) continue;
    const teamIds = team.map((u) => u.id);
    const problem = await db
      .select()
      .from(t.enrollments)
      .where(and(inArray(t.enrollments.userId, teamIds), inArray(t.enrollments.complianceStatus, ["OVERDUE", "DUE_SOON"])));
    if (problem.length === 0) continue;
    const overdue = problem.filter((p) => p.complianceStatus === "OVERDUE").length;
    const dueSoon = problem.length - overdue;
    // not reached directly: no email + no app open in 7 days (proxy: no ui_events)
    const cutoff = new Date(now.getTime() - 7 * 24 * 3600_000);
    const seen = await db
      .select({ userId: t.uiEvents.userId })
      .from(t.uiEvents)
      .where(and(inArray(t.uiEvents.userId, teamIds), sql`${t.uiEvents.ts} > ${cutoff}`));
    const seenIds = new Set(seen.map((s) => s.userId));
    const unreached = team.filter((u) => !u.email && !seenIds.has(u.id) && problem.some((p) => p.userId === u.id));
    const summary =
      `${overdue} overdue and ${dueSoon} due-soon item(s) on your team. ` +
      (unreached.length > 0
        ? `Not reached directly (no email, inactive 7d) — nudge in person: ${unreached.map((u) => u.name).join(", ")}.`
        : "Everyone with open items has been reached in-app.");
    await notify(manager.id, "manager_digest", { summary }, `digest:${manager.id}:${localDate(now)}`);
    sent++;
  }
  return sent;
}

/** Retention maximums (spec FR-13.3). Returns rows deleted. */
export async function purge(now = new Date()): Promise<number> {
  const d = (days: number) => new Date(now.getTime() - days * 24 * 3600_000);
  let total = 0;
  const del = async (result: { rowCount?: number | null } | unknown[]) =>
    Array.isArray(result) ? result.length : ((result as { rowCount?: number | null }).rowCount ?? 0);

  total += await del(await db.delete(t.hrAuditLog).where(lt(t.hrAuditLog.ts, d(365))));
  total += await del(await db.delete(t.hrMessages).where(lt(t.hrMessages.createdAt, d(365))));
  total += await del(await db.delete(t.tutorMessages).where(lt(t.tutorMessages.createdAt, d(365))));
  // integrity events: 6 months after attempt finalization
  const oldEvents = await db
    .select({ id: t.integrityEvents.id, attemptId: t.integrityEvents.attemptId })
    .from(t.integrityEvents)
    .where(lt(t.integrityEvents.ts, d(180)));
  if (oldEvents.length > 0) {
    const finalized = await db
      .select({ id: t.attempts.id })
      .from(t.attempts)
      .where(inArray(t.attempts.state, ["GRADED", "CLEARED", "VOIDED"]));
    const finalizedIds = new Set(finalized.map((a) => a.id));
    const purgeable = oldEvents.filter((e) => finalizedIds.has(e.attemptId)).map((e) => e.id);
    if (purgeable.length > 0) {
      total += await del(await db.delete(t.integrityEvents).where(inArray(t.integrityEvents.id, purgeable)));
    }
  }
  // raw watch buckets: 90 days (aggregate % survives via lesson completion status)
  const staleProgress = await db
    .select()
    .from(t.lessonProgress)
    .where(and(lt(t.lessonProgress.updatedAt, d(90)), sql`${t.lessonProgress.watchedBuckets} IS NOT NULL`));
  for (const p of staleProgress) {
    await db.update(t.lessonProgress).set({ watchedBuckets: null }).where(eq(t.lessonProgress.id, p.id));
    total++;
  }
  total += await del(await db.delete(t.aiCallLog).where(lt(t.aiCallLog.ts, d(730))));
  total += await del(await db.delete(t.loginAttempts).where(lt(t.loginAttempts.at, d(30))));
  return total;
}
