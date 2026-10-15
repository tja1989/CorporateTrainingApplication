import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { LearningDatabase } from "@/lib/lms/learning-cycle";
import type { Actor } from "@/lib/auth/roles";
import { hasPermission } from "@/lib/auth/permissions";
import { toCsv } from "@/lib/reports";
import { feedbackTable, freshFeedbackActor, type FeedbackRow } from "./service";
import type { FeedbackKind, DeliverySnapshot } from "./types";
import type { FeedbackPeriod } from "./periods";
export type FeedbackReportFilters = {
  kind: FeedbackKind;
  period: FeedbackPeriod;
  courseId?: string;
  instructorId?: string;
};
export type ModerationItem = {
  id: string;
  kind: FeedbackKind;
  revision: number;
  course: string;
  rating: number;
  comment: string;
  hidden: boolean;
  excluded: boolean;
  employeeName: string;
  reason: string;
};
export type FeedbackReport = {
  columns: string[];
  rows: Array<Array<string | number>>;
  responses: number;
  average: number | null;
  distribution: [number, number, number, number, number];
  periodLabel: string;
  moderationItems: ModerationItem[];
};
export type FeedbackReportRecord = {
  response: FeedbackRow;
  delivery: DeliverySnapshot | null;
  courseTitle: string;
  instructorName: string;
  employeeName: string;
  employeeCode: string;
  employeeErased?: boolean;
  revisions: Array<
    Pick<
      typeof t.feedbackRevisions.$inferSelect,
      | "revision"
      | "newRating"
      | "newComment"
      | "newHidden"
      | "newExcluded"
      | "at"
    >
  >;
};
function validate(filters: FeedbackReportFilters) {
  if (!["course", "instructor"].includes(filters.kind))
    throw new Error("Choose course or instructor feedback.");
  const { start, end } = filters.period;
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    end.getTime() - start.getTime() > 367 * 86400000
  )
    throw new Error("Choose a valid feedback reporting period.");
}
function visible(actor: Actor, record: FeedbackReportRecord) {
  if (actor.role === "ADMIN" || actor.role === "HR_HEAD") return true;
  if (actor.role === "DEPARTMENT_HEAD")
    return (
      !!actor.departmentId &&
      record.delivery?.departmentId === actor.departmentId
    );
  if (actor.role === "INSTRUCTOR")
    return record.delivery?.instructorId === actor.id;
  return false;
}
const average = (scores: number[]) =>
  scores.length
    ? Math.round(
        (scores.reduce((sum, n) => sum + n, 0) / scores.length) * 100,
      ) / 100
    : null;
export function assembleFeedbackReport(
  actor: Actor,
  filters: FeedbackReportFilters,
  records: FeedbackReportRecord[],
): FeedbackReport {
  validate(filters);
  if (!hasPermission(actor.role, "feedback.read"))
    throw new Error("Not authorized to read feedback reports.");
  const attributed =
      actor.role === "ADMIN" ||
      actor.role === "HR_HEAD" ||
      (actor.role === "DEPARTMENT_HEAD" && filters.kind === "course"),
    aggregate =
      actor.role === "DEPARTMENT_HEAD" && filters.kind === "instructor";
  const columns = aggregate
    ? [
        "Course",
        "Instructor",
        "Responses",
        "Average",
        "1 star",
        "2 stars",
        "3 stars",
        "4 stars",
        "5 stars",
      ]
    : [
        "Course",
        ...(filters.kind === "instructor" ? ["Instructor"] : []),
        ...(attributed ? ["Employee", "Employee ID"] : []),
        "Rating",
        "Comment",
        "Submitted",
      ];
  const rows: Array<Array<string | number>> = [],
    distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0],
    scores: number[] = [],
    moderationItems: ModerationItem[] = [];
  const groups = new Map<
    string,
    { course: string; instructor: string; scores: number[] }
  >();
  for (const record of records) {
    const r = record.response;
    if (
      !visible(actor, record) ||
      r.createdAt < filters.period.start ||
      r.createdAt >= filters.period.end ||
      (filters.courseId && r.courseId !== filters.courseId) ||
      (filters.instructorId &&
        record.delivery?.instructorId !== filters.instructorId)
    )
      continue;
    const revision = record.revisions
      .filter((v) => v.at < filters.period.end)
      .sort((a, b) => b.revision - a.revision)[0];
    if (!revision) continue;
    if (
      !record.employeeErased &&
      hasPermission(actor.role, "feedback.moderate")
    )
      moderationItems.push({
        id: r.id,
        kind: filters.kind,
        revision: r.revision,
        course: record.courseTitle,
        rating: r.rating,
        comment: r.comment,
        hidden: r.commentHidden,
        excluded: r.excluded,
        employeeName: record.employeeName,
        reason: r.moderationReason,
      });
    if (revision.newExcluded) continue;
    const rating = revision.newRating;
    scores.push(rating);
    distribution[rating - 1]++;
    if (aggregate) {
      const key = r.courseId + ":" + (record.delivery?.instructorId ?? "");
      const group = groups.get(key) ?? {
        course: record.courseTitle,
        instructor: record.instructorName,
        scores: [],
      };
      group.scores.push(rating);
      groups.set(key, group);
    } else
      rows.push([
        record.courseTitle,
        ...(filters.kind === "instructor" ? [record.instructorName] : []),
        ...(attributed ? [record.employeeName, record.employeeCode] : []),
        rating,
        r.commentHidden || revision.newHidden ? "" : revision.newComment,
        r.createdAt.toISOString(),
      ]);
  }
  for (const group of groups.values())
    rows.push([
      group.course,
      group.instructor,
      group.scores.length,
      average(group.scores)!,
      ...[1, 2, 3, 4, 5].map(
        (n) => group.scores.filter((score) => score === n).length,
      ),
    ]);
  return {
    columns,
    rows,
    responses: scores.length,
    average: average(scores),
    distribution,
    periodLabel: filters.period.label,
    moderationItems,
  };
}
export async function feedbackReport(
  actor: Actor,
  filters: FeedbackReportFilters,
  connection: LearningDatabase = db,
): Promise<FeedbackReport> {
  validate(filters);
  if (!hasPermission(actor.role, "feedback.read"))
    throw new Error("Not authorized to read feedback reports.");
  const current = await freshFeedbackActor(actor, connection),
    table = feedbackTable(filters.kind);
  const scope =
    current.role === "DEPARTMENT_HEAD"
      ? current.departmentId
        ? eq(t.courseDeliveries.departmentId, current.departmentId)
        : sql`false`
      : current.role === "INSTRUCTOR"
        ? eq(t.courseDeliveries.instructorId, current.id)
        : undefined;
  const records = await connection
    .select({
      response: table,
      delivery: t.courseDeliveries,
      courseTitle: t.courses.title,
      employeeName: t.users.name,
      employeeCode: t.users.employeeId,
      erasedAt: t.users.erasedAt,
    })
    .from(table)
    .leftJoin(t.courseDeliveries, eq(table.deliveryId, t.courseDeliveries.id))
    .leftJoin(t.courses, eq(table.courseId, t.courses.id))
    .leftJoin(t.users, eq(table.employeeId, t.users.id))
    .where(
      and(
        scope,
        gte(table.createdAt, filters.period.start),
        lt(table.createdAt, filters.period.end),
        filters.courseId ? eq(table.courseId, filters.courseId) : undefined,
        filters.instructorId
          ? eq(t.courseDeliveries.instructorId, filters.instructorId)
          : undefined,
      ),
    )
    .orderBy(desc(table.createdAt));
  const ids = records.map((r) => r.response.id),
    trainerIds = [
      ...new Set(
        records
          .map((r) => r.delivery?.instructorId)
          .filter((v): v is string => !!v),
      ),
    ];
  const [revisions, trainers] = await Promise.all([
    ids.length
      ? connection
          .select()
          .from(t.feedbackRevisions)
          .where(
            and(
              eq(t.feedbackRevisions.kind, filters.kind),
              inArray(t.feedbackRevisions.responseId, ids),
              lt(t.feedbackRevisions.at, filters.period.end),
            ),
          )
      : [],
    trainerIds.length
      ? connection
          .select({ id: t.users.id, name: t.users.name })
          .from(t.users)
          .where(inArray(t.users.id, trainerIds))
      : [],
  ]);
  const names = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));
  return assembleFeedbackReport(
    current,
    filters,
    records.map((r) => ({
      ...r,
      courseTitle: r.courseTitle ?? "Completed course",
      employeeErased: !!r.erasedAt,
      employeeName: r.erasedAt
        ? "Former colleague"
        : (r.employeeName ?? "Employee"),
      employeeCode: r.erasedAt ? "" : (r.employeeCode ?? ""),
      instructorName:
        names.get(r.delivery?.instructorId ?? "") ??
        "Instructor not recorded",
      revisions: revisions.filter((v) => v.responseId === r.response.id),
    })),
  );
}
export function feedbackCsv(report: FeedbackReport): string {
  const summary = [
    report.periodLabel,
    report.responses,
    report.average ?? "",
    ...report.distribution,
  ];
  return toCsv({
    title: "Feedback",
    columns: [
      "Reporting period",
      "Response count",
      "Average rating",
      "1 star",
      "2 stars",
      "3 stars",
      "4 stars",
      "5 stars",
      ...report.columns,
    ],
    rows: report.rows.length
      ? report.rows.map((row) => [...summary, ...row])
      : [[...summary, ...report.columns.map(() => "")]],
  });
}
