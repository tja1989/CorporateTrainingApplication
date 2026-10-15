import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import {
  lockLearningCourse,
  type LearningDatabase,
  type LearningTransaction,
} from "./learning-cycle";
import { endOfDayInTz } from "@/lib/time";
import type { DueRule, RuleCriteria } from "@/lib/db/schema";
import { snapshotEnrollment } from "@/lib/feedback/delivery";
import { isCourseAvailable } from "@/lib/courses/availability";
import { lockAssessmentCurriculum } from "@/lib/courses/workflow";
import { enrollmentDeadline } from "@/lib/courses/planning";
import { assertOrderedPathCompatibility } from "@/lib/courses/planning-service";
import { computeComplianceStatus } from "./compliance";

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
  if (criteria.country && !storeAncestry.includes(criteria.country))
    return false;
  if (criteria.groupId && !user.groupIds.includes(criteria.groupId))
    return false;
  if (
    criteria.jobTitle &&
    user.jobTitle?.toLowerCase() !== criteria.jobTitle.toLowerCase()
  )
    return false;
  if (
    criteria.hiredAfter &&
    (!user.hireDate || user.hireDate < new Date(criteria.hiredAfter))
  )
    return false;
  if (
    criteria.hiredBefore &&
    (!user.hireDate || user.hireDate > new Date(criteria.hiredBefore))
  )
    return false;
  return true;
}

/**
 * Due date per rule (spec FR-3.1): fixed | N days from enrollment | N days from hire —
 * hire-relative never lands in the past: max(hire+N, enrollment+14d).
 */
export function computeDueDate(
  dueRule: DueRule | null,
  user: Pick<User, "hireDate">,
  tz: string,
  now = new Date(),
): Date | null {
  if (!dueRule) return null;
  if (dueRule.kind === "fixed")
    return endOfDayInTz(0, tz, new Date(dueRule.date));
  if (dueRule.kind === "from_enrollment")
    return endOfDayInTz(dueRule.days, tz, now);
  const fromHire = user.hireDate
    ? endOfDayInTz(dueRule.days, tz, user.hireDate)
    : endOfDayInTz(dueRule.days, tz, now);
  const floor = endOfDayInTz(14, tz, now);
  return fromHire > floor ? fromHire : floor;
}

async function storeAncestry(
  storeId: string | null,
  connection: LearningDatabase = db,
): Promise<string[]> {
  if (!storeId) return [];
  const out: string[] = [];
  let cursor: string | null = storeId;
  for (let i = 0; i < 5 && cursor; i++) {
    out.push(cursor);
    const [unit] = await connection
      .select()
      .from(t.orgUnits)
      .where(eq(t.orgUnits.id, cursor))
      .limit(1);
    cursor = unit?.parentId ?? null;
  }
  return out;
}

async function storeTz(
  storeId: string | null,
  connection: LearningDatabase = db,
): Promise<string> {
  if (!storeId) return "Asia/Dubai";
  const [unit] = await connection
    .select()
    .from(t.orgUnits)
    .where(eq(t.orgUnits.id, storeId))
    .limit(1);
  return unit?.timezone ?? "Asia/Dubai";
}

/** Course ids a rule targets (a path fans out to its courses). */
async function targetCourseIds(
  rule: Rule,
  connection: LearningDatabase = db,
): Promise<string[]> {
  if (rule.targetType === "course") return [rule.targetId];
  const rows = await connection
    .select()
    .from(t.pathCourses)
    .where(eq(t.pathCourses.pathId, rule.targetId));
  return rows.sort((a, b) => a.sort - b.sort).map((r) => r.courseId);
}

/** Resolve current path restrictions independently of immutable enrollment provenance.
 * An overlapping course rule or a disabled original rule must not hide a surviving
 * matching path assignment. Callers still require an active rule enrollment. */
export async function matchingRulePathIds(
  userId: string,
  courseId: string,
  connection: LearningDatabase = db,
): Promise<string[]> {
  const [user] = await connection
    .select()
    .from(t.users)
    .where(eq(t.users.id, userId))
    .limit(1);
  if (!user || user.erasedAt) return [];
  const rules = await connection
    .select({ rule: t.enrollmentRules })
    .from(t.enrollmentRules)
    .innerJoin(
      t.pathCourses,
      and(
        eq(t.pathCourses.pathId, t.enrollmentRules.targetId),
        eq(t.pathCourses.courseId, courseId),
      ),
    )
    .where(
      and(
        eq(t.enrollmentRules.active, true),
        eq(t.enrollmentRules.targetType, "path"),
      ),
    );
  const ancestry = await storeAncestry(user.storeId, connection);
  return [
    ...new Set(
      rules
        .filter(({ rule }) => userMatchesRule(user, rule.criteria, ancestry))
        .map(({ rule }) => rule.targetId),
    ),
  ];
}

/**
 * Idempotent re-evaluation of one user against all active rules (spec FR-3.2):
 * fires on user create/update and on rule create/update (then called per user).
 * - never duplicates an active enrollment
 * - never touches completion history
 * - withdraws incomplete rule-created enrollments whose rule no longer matches
 */
export async function reevaluateUser(
  userId: string,
  transaction?: LearningTransaction,
  now = new Date(),
): Promise<{ enrolled: number; withdrawn: number }> {
  const evaluate = async (tx: LearningTransaction) => {
    await lockAssessmentCurriculum(tx);
    const [user] = await tx
      .select()
      .from(t.users)
      .where(eq(t.users.id, userId))
      .limit(1);
    if (!user || user.erasedAt) return { enrolled: 0, withdrawn: 0 };
    const rules = await tx
      .select()
      .from(t.enrollmentRules)
      .where(eq(t.enrollmentRules.active, true))
      .orderBy(t.enrollmentRules.id);
    const ancestry = await storeAncestry(user.storeId, tx);
    const tz = await storeTz(user.storeId, tx);
    const targets = new Map<string, Rule>();
    const assignable = new Map<string, Rule>();
    const deadlines = new Map<string, Date | null>();
    const candidatePaths: string[] = [];
    for (const rule of rules.filter((r) =>
      userMatchesRule(user, r.criteria, ancestry),
    )) {
      const courseIds = await targetCourseIds(rule, tx);
      // Keep matching coverage for existing history, but assign a path only as a whole.
      for (const courseId of courseIds)
        if (!targets.has(courseId)) targets.set(courseId, rule);
      const courses = courseIds.length
        ? await tx
            .select()
            .from(t.courses)
            .where(inArray(t.courses.id, courseIds))
        : [];
      if (
        !courseIds.length ||
        courses.length !== new Set(courseIds).size ||
        courses.some((c) => !isCourseAvailable(c))
      )
        continue;
      const candidateDeadlines = new Map<string, Date | null>();
      try {
        if (rule.targetType === "path")
          await assertOrderedPathCompatibility(
            tx,
            undefined,
            [...candidatePaths, rule.targetId],
            undefined,
            userId,
          );
        const explicit = computeDueDate(rule.dueRule, user, tz, now);
        for (const course of courses)
          candidateDeadlines.set(
            course.id,
            enrollmentDeadline(course, explicit),
          );
      } catch {
        continue;
      }
      if (rule.targetType === "path") candidatePaths.push(rule.targetId);
      for (const courseId of courseIds)
        if (!assignable.has(courseId)) {
          assignable.set(courseId, rule);
          deadlines.set(courseId, candidateDeadlines.get(courseId) ?? null);
        }
    }
    const before = await tx
      .select()
      .from(t.enrollments)
      .where(eq(t.enrollments.userId, userId));
    // Stable lock order also covers withdrawals and concurrent manual/renewal assignments.
    for (const courseId of [
      ...new Set([...targets.keys(), ...before.map((e) => e.courseId)]),
    ].sort()) {
      await lockLearningCourse(tx, userId, courseId);
    }
    const existing = await tx
      .select()
      .from(t.enrollments)
      .where(eq(t.enrollments.userId, userId));
    let enrolled = 0;
    for (const [courseId, rule] of assignable) {
      if (
        existing.some(
          (e) =>
            e.courseId === courseId &&
            ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(e.status),
        )
      )
        continue;
      const inserted = await tx
        .insert(t.enrollments)
        .values({
          id: id(),
          userId,
          courseId,
          source: "rule",
          sourceId: rule.id,
          dueAt: deadlines.get(courseId) ?? null,
          status: "NOT_STARTED",
          complianceStatus: computeComplianceStatus({
            status: "NOT_STARTED",
            dueAt: deadlines.get(courseId) ?? null,
            certificateExpiresAt: null,
            now,
          }),
        })
        .onConflictDoNothing()
        .returning();
      for (const enrollment of inserted)
        await snapshotEnrollment(tx, enrollment.id);
      existing.push(...inserted);
      enrolled += inserted.length;
    }
    // Another matching rule can continue to cover a course after its original rule stops matching.
    const staleIds = existing
      .filter(
        (e) =>
          e.source === "rule" &&
          !targets.has(e.courseId) &&
          (e.status === "NOT_STARTED" || e.status === "IN_PROGRESS"),
      )
      .map((e) => e.id);
    if (staleIds.length)
      await tx
        .update(t.enrollments)
        .set({
          status: "WITHDRAWN",
          complianceStatus: "WITHDRAWN",
          withdrawnAt: new Date(),
        })
        .where(inArray(t.enrollments.id, staleIds));
    return { enrolled, withdrawn: staleIds.length };
  };
  return transaction ? evaluate(transaction) : db.transaction(evaluate);
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
  transaction?: LearningTransaction,
): Promise<number> {
  const create = async (tx: LearningTransaction): Promise<number> => {
    await lockAssessmentCurriculum(tx);
    const courseIds =
      target.type === "course"
        ? [target.id]
        : (
            await tx
              .select()
              .from(t.pathCourses)
              .where(eq(t.pathCourses.pathId, target.id))
          )
            .sort((a, b) => a.sort - b.sort)
            .map((row) => row.courseId);
    if (!courseIds.length) return 0;
    if (target.type === "path")
      await assertOrderedPathCompatibility(
        tx,
        undefined,
        [target.id],
        undefined,
        userId,
      );
    const courses = await tx
      .select()
      .from(t.courses)
      .where(inArray(t.courses.id, courseIds));
    if (
      courses.length !== new Set(courseIds).size ||
      courses.some((course) => !isCourseAvailable(course))
    ) {
      if (source === "recert") return 0;
      throw new Error(
        "Every target course must be published and approved before assignment.",
      );
    }
    for (const courseId of [...new Set(courseIds)].sort())
      await lockLearningCourse(tx, userId, courseId);
    const existing = await tx
      .select()
      .from(t.enrollments)
      .where(
        and(
          eq(t.enrollments.userId, userId),
          inArray(t.enrollments.courseId, courseIds),
        ),
      );
    const needed = new Set(
      courseIds.filter(
        (courseId) =>
          !existing.some(
            (row) =>
              row.courseId === courseId &&
              (row.status === "NOT_STARTED" ||
                row.status === "IN_PROGRESS" ||
                (source === "recert" &&
                  row.source === "recert" &&
                  row.sourceId === sourceId)),
          ),
      ),
    );
    const deadlines = new Map<string, Date | null>();
    try {
      for (const course of courses.filter((course) => needed.has(course.id)))
        deadlines.set(course.id, enrollmentDeadline(course, dueAt));
    } catch (error) {
      if (source === "recert") return 0;
      throw error;
    }
    // Validate every new target before writing any path enrollment. Duplicates retain their existing deadlines.
    let n = 0;
    for (const courseId of [...new Set(courseIds)]) {
      if (!needed.has(courseId)) continue;
      const enrollmentId = id(),
        deadline = deadlines.get(courseId) ?? null;
      await tx.insert(t.enrollments).values({
        id: enrollmentId,
        userId,
        courseId,
        source: target.type === "path" ? "path" : source,
        sourceId: target.type === "path" ? target.id : sourceId,
        dueAt: deadline,
        status: "NOT_STARTED",
        complianceStatus: computeComplianceStatus({
          status: "NOT_STARTED",
          dueAt: deadline,
          certificateExpiresAt: null,
        }),
      });
      await snapshotEnrollment(tx, enrollmentId);
      if (source === "recert") {
        const lessons = await tx
          .select({ id: t.lessons.id })
          .from(t.lessons)
          .innerJoin(t.modules, eq(t.lessons.moduleId, t.modules.id))
          .where(eq(t.modules.courseId, courseId));
        if (lessons.length)
          await tx
            .update(t.lessonProgress)
            .set({
              status: "NOT_STARTED",
              watchedBuckets: [],
              lastPositionSec: 0,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(t.lessonProgress.userId, userId),
                inArray(
                  t.lessonProgress.lessonId,
                  lessons.map((row) => row.id),
                ),
              ),
            );
      }
      n++;
    }
    return n;
  };
  return transaction ? create(transaction) : db.transaction(create);
}
