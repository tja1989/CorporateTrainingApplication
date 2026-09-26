import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { lockLearningCourse } from "./learning-cycle";
import { endOfDayInTz } from "@/lib/time";
import type { DueRule, RuleCriteria } from "@/lib/db/schema";

type User = typeof t.users.$inferSelect;
type Rule = typeof t.enrollmentRules.$inferSelect;

/** Pure predicate: does this user match this rule's criteria? Unit-tested. */
export function userMatchesRule(
  user: Pick<User, "storeId" | "groupIds" | "jobTitle" | "hireDate" | "role">,
  criteria: RuleCriteria,
  storeAncestry: string[], // [storeId, regionId, countryId] for the user's store
): boolean {
  if (criteria.store && !storeAncestry.includes(criteria.store)) return false;
  if (criteria.region && !storeAncestry.includes(criteria.region)) return false;
  if (criteria.country && !storeAncestry.includes(criteria.country)) return false;
  if (criteria.groupId && !user.groupIds.includes(criteria.groupId)) return false;
  if (criteria.jobTitle && user.jobTitle?.toLowerCase() !== criteria.jobTitle.toLowerCase()) return false;
  if (criteria.hiredAfter && (!user.hireDate || user.hireDate < new Date(criteria.hiredAfter))) return false;
  if (criteria.hiredBefore && (!user.hireDate || user.hireDate > new Date(criteria.hiredBefore))) return false;
  return true;
}

/**
 * Due date per rule (spec FR-3.1): fixed | N days from enrollment | N days from hire —
 * hire-relative never lands in the past: max(hire+N, enrollment+14d).
 */
export function computeDueDate(dueRule: DueRule | null, user: Pick<User, "hireDate">, tz: string, now = new Date()): Date | null {
  if (!dueRule) return null;
  if (dueRule.kind === "fixed") return endOfDayInTz(0, tz, new Date(dueRule.date));
  if (dueRule.kind === "from_enrollment") return endOfDayInTz(dueRule.days, tz, now);
  const fromHire = user.hireDate
    ? endOfDayInTz(dueRule.days, tz, user.hireDate)
    : endOfDayInTz(dueRule.days, tz, now);
  const floor = endOfDayInTz(14, tz, now);
  return fromHire > floor ? fromHire : floor;
}

async function storeAncestry(storeId: string | null): Promise<string[]> {
  if (!storeId) return [];
  const out: string[] = [];
  let cursor: string | null = storeId;
  for (let i = 0; i < 5 && cursor; i++) {
    out.push(cursor);
    const [unit] = await db.select().from(t.orgUnits).where(eq(t.orgUnits.id, cursor)).limit(1);
    cursor = unit?.parentId ?? null;
  }
  return out;
}

async function storeTz(storeId: string | null): Promise<string> {
  if (!storeId) return "Asia/Dubai";
  const [unit] = await db.select().from(t.orgUnits).where(eq(t.orgUnits.id, storeId)).limit(1);
  return unit?.timezone ?? "Asia/Dubai";
}

/** Course ids a rule targets (a path fans out to its courses). */
async function targetCourseIds(rule: Rule): Promise<string[]> {
  if (rule.targetType === "course") return [rule.targetId];
  const rows = await db.select().from(t.pathCourses).where(eq(t.pathCourses.pathId, rule.targetId));
  return rows.sort((a, b) => a.sort - b.sort).map((r) => r.courseId);
}

/**
 * Idempotent re-evaluation of one user against all active rules (spec FR-3.2):
 * fires on user create/update and on rule create/update (then called per user).
 * - never duplicates an active enrollment
 * - never touches completion history
 * - withdraws incomplete rule-created enrollments whose rule no longer matches
 */
export async function reevaluateUser(userId: string): Promise<{ enrolled: number; withdrawn: number }> {
  const [user] = await db.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  if (!user || user.erasedAt) return { enrolled: 0, withdrawn: 0 };

  const rules = await db.select().from(t.enrollmentRules).where(eq(t.enrollmentRules.active, true));
  const ancestry = await storeAncestry(user.storeId);
  const tz = await storeTz(user.storeId);

  const matching = rules.filter((r) => userMatchesRule(user, r.criteria, ancestry));
  const matchingIds = new Set(matching.map((r) => r.id));

  const existing = await db.select().from(t.enrollments).where(eq(t.enrollments.userId, userId));
  let enrolled = 0;
  let withdrawn = 0;

  // 1) Enroll for matching rules that lack an active-or-completed enrollment.
  for (const rule of matching) {
    const courseIds = await targetCourseIds(rule);
    for (const courseId of courseIds) {
      const has = existing.some(
        (e) => e.courseId === courseId && (e.status === "NOT_STARTED" || e.status === "IN_PROGRESS" || e.status === "COMPLETED"),
      );
      if (has) continue;
      const dueAt = computeDueDate(rule.dueRule, user, tz);
      await db.insert(t.enrollments).values({
        id: id(),
        userId,
        courseId,
        source: "rule",
        sourceId: rule.id,
        dueAt,
        status: "NOT_STARTED",
        complianceStatus: "ON_TRACK",
      });
      enrolled++;
    }
  }

  // 2) Withdraw incomplete rule-created enrollments whose rule no longer matches (or is inactive).
  const staleIds = existing
    .filter(
      (e) =>
        e.source === "rule" &&
        e.sourceId &&
        !matchingIds.has(e.sourceId) &&
        (e.status === "NOT_STARTED" || e.status === "IN_PROGRESS"),
    )
    .map((e) => e.id);
  if (staleIds.length > 0) {
    await db
      .update(t.enrollments)
      .set({ status: "WITHDRAWN", complianceStatus: "WITHDRAWN", withdrawnAt: new Date() })
      .where(inArray(t.enrollments.id, staleIds));
    withdrawn = staleIds.length;
  }

  return { enrolled, withdrawn };
}

/** Re-evaluate everyone (rule created/edited). Batchwise, fine at MVP scale. */
export async function reevaluateAllUsers(): Promise<void> {
  const usersRows = await db.select({ id: t.users.id }).from(t.users);
  for (const u of usersRows) await reevaluateUser(u.id);
}

/** Manual enrollment honoring the no-duplicate rule. */
export async function enrollUser(
  userId: string,
  target: { type: "course" | "path"; id: string },
  source: "manual" | "path" | "recert",
  sourceId: string | null,
  dueAt: Date | null,
): Promise<number> {
  const courseIds =
    target.type === "course"
      ? [target.id]
      : (await db.select().from(t.pathCourses).where(eq(t.pathCourses.pathId, target.id)))
          .sort((a, b) => a.sort - b.sort)
          .map((r) => r.courseId);
  let n = 0;
  for (const courseId of courseIds) {
    const created = await db.transaction(async tx => {
      await lockLearningCourse(tx, userId, courseId);
      const existing = await tx.select().from(t.enrollments)
        .where(and(eq(t.enrollments.userId, userId), eq(t.enrollments.courseId, courseId)));
      if (existing.some(e => e.status === "NOT_STARTED" || e.status === "IN_PROGRESS")) return false;
      // A repeated/concurrent sweep of the same certificate cannot create a
      // second renewal even if its first assignment has already completed.
      if (source === "recert" && existing.some(e => e.source === "recert" && e.sourceId === sourceId)) return false;
      await tx.insert(t.enrollments).values({
        id: id(), userId, courseId,
        source: target.type === "path" ? "path" : source,
        sourceId: target.type === "path" ? target.id : sourceId,
        dueAt, status: "NOT_STARTED", complianceStatus: "ON_TRACK",
      });
      if (source === "recert") {
        const lessons = await tx.select({ id: t.lessons.id }).from(t.lessons)
          .innerJoin(t.modules, eq(t.lessons.moduleId, t.modules.id)).where(eq(t.modules.courseId, courseId));
        if (lessons.length) await tx.update(t.lessonProgress)
          .set({ status: "NOT_STARTED", watchedBuckets: [], lastPositionSec: 0, updatedAt: new Date() })
          .where(and(eq(t.lessonProgress.userId, userId), inArray(t.lessonProgress.lessonId, lessons.map(l => l.id))));
      }
      return true;
    });
    if (created) n++;
  }
  return n;
}
