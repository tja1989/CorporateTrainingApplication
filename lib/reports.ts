import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { aiAvailable, structuredCall } from "@/lib/ai/gateway";

/**
 * Reporting engine (spec FR-10.2/10.3): every report real-time and filterable;
 * Ask Reports emits a TYPED, whitelist-validated query plan — never raw SQL
 * from a model. Scope (team vs all) is applied server-side from the caller.
 */

export type ReportId = "completion" | "compliance" | "transcript" | "cert_expiry" | "engagement" | "quiz_results";

export type ReportFilters = {
  courseTitle?: string;
  storeName?: string;
  complianceStatus?: string;
  daysWindow?: number; // cert expiry horizon / engagement window
  employeeId?: string;
  userIds?: string[]; // scope injection (manager team) — server-set, never model-set
};

export type ReportResult = { title: string; columns: string[]; rows: Array<Array<string | number>> };

async function resolveScope(filters: ReportFilters): Promise<{ userWhere: SQL | undefined; courseIds?: string[] }> {
  const clauses: SQL[] = [];
  if (filters.userIds !== undefined) clauses.push(filters.userIds.length ? inArray(t.users.id, filters.userIds) : sql`false`);
  if (filters.storeName) {
    const stores = await db.select().from(t.orgUnits).where(sql`lower(name) LIKE ${"%" + filters.storeName.toLowerCase() + "%"}`);
    clauses.push(inArray(t.users.storeId, stores.map((s) => s.id).concat(["__none__"])));
  }
  if (filters.employeeId) clauses.push(eq(t.users.employeeId, filters.employeeId.toUpperCase()));
  let courseIds: string[] | undefined;
  if (filters.courseTitle) {
    const courses = await db
      .select()
      .from(t.courses)
      .where(sql`lower(title) LIKE ${"%" + filters.courseTitle.toLowerCase() + "%"}`);
    courseIds = courses.map((c) => c.id);
  }
  return { userWhere: clauses.length ? and(...clauses) : undefined, courseIds };
}

export async function runReport(report: ReportId, filters: ReportFilters): Promise<ReportResult> {
  const { userWhere, courseIds } = await resolveScope(filters);
  // Stable source order keeps page boundaries and full CSV output identical.
  // Existing report-specific sorting (notably certificate expiry) still applies.
  const users = await (userWhere ? db.select().from(t.users).where(userWhere) : db.select().from(t.users)).orderBy(t.users.id);
  const activeUsers = users.filter((u) => !u.erasedAt);
  const userIds = activeUsers.map((u) => u.id);
  const nameOf = new Map(activeUsers.map((u) => [u.id, u]));
  const allCourses = await db.select().from(t.courses);
  const courseOf = new Map(allCourses.map((c) => [c.id, c]));
  const units = await db.select().from(t.orgUnits);
  const storeNameOf = new Map(units.map((u) => [u.id, u.name]));
  const enrollWhere = [
    userIds.length ? inArray(t.enrollments.userId, userIds) : sql`false`,
    courseIds ? inArray(t.enrollments.courseId, courseIds.length ? courseIds : ["__none__"]) : undefined,
    filters.complianceStatus ? eq(t.enrollments.complianceStatus, filters.complianceStatus as never) : undefined,
  ].filter((x): x is SQL => !!x);
  const enrollments = await db.select().from(t.enrollments).where(and(...enrollWhere)).orderBy(t.enrollments.id);

  switch (report) {
    case "completion": {
      const byCourse = new Map<string, { enrolled: number; completed: number; overdue: number; inProgress: number }>();
      for (const e of enrollments) {
        if (e.status === "WITHDRAWN") continue;
        const s = byCourse.get(e.courseId) ?? { enrolled: 0, completed: 0, overdue: 0, inProgress: 0 };
        s.enrolled++;
        if (e.status === "COMPLETED") s.completed++;
        else if (e.status === "IN_PROGRESS") s.inProgress++;
        if (e.complianceStatus === "OVERDUE") s.overdue++;
        byCourse.set(e.courseId, s);
      }
      return {
        title: "Course completion",
        columns: ["Course", "Enrolled", "Completed", "In progress", "Overdue", "Completion %"],
        rows: [...byCourse.entries()].map(([cid, s]) => [
          courseOf.get(cid)?.title ?? cid,
          s.enrolled,
          s.completed,
          s.inProgress,
          s.overdue,
          s.enrolled ? Math.round((s.completed / s.enrolled) * 100) : 0,
        ]),
      };
    }
    case "compliance": {
      return {
        title: "Compliance matrix",
        columns: ["Employee", "ID", "Store", "Course", "Status", "Due date"],
        rows: enrollments
          .filter((e) => e.status !== "WITHDRAWN")
          .map((e) => {
            const u = nameOf.get(e.userId);
            return [
              u?.name ?? "—",
              u?.employeeId ?? "—",
              (u?.storeId ? storeNameOf.get(u.storeId) : undefined) ?? "—",
              courseOf.get(e.courseId)?.title ?? e.courseId,
              e.complianceStatus,
              e.dueAt?.toISOString().slice(0, 10) ?? "—",
            ];
          }),
      };
    }
    case "transcript": {
      const records = await db
        .select()
        .from(t.completionRecords)
        .where(userIds.length ? inArray(t.completionRecords.userId, userIds) : sql`false`).orderBy(t.completionRecords.id);
      return {
        title: "Learner transcript",
        columns: ["Employee", "ID", "Course", "Completed at", "Score"],
        rows: records.filter(r => !courseIds || courseIds.includes(r.courseId)).map((r) => [
          nameOf.get(r.userId)?.name ?? "—",
          nameOf.get(r.userId)?.employeeId ?? "—",
          courseOf.get(r.courseId)?.title ?? r.courseId,
          r.completedAt.toISOString().slice(0, 10),
          r.score ?? "—",
        ]),
      };
    }
    case "cert_expiry": {
      const horizon = filters.daysWindow ?? 90;
      const certs = await db
        .select()
        .from(t.certificates)
        .where(userIds.length ? inArray(t.certificates.userId, userIds) : sql`false`).orderBy(t.certificates.id);
      const cutoff = Date.now() + horizon * 24 * 3600_000;
      return {
        title: `Certificates expiring within ${horizon} days`,
        columns: ["Employee", "ID", "Course", "Expires", "Serial"],
        rows: certs
          .filter((c) => (!courseIds || courseIds.includes(c.courseId)) && c.expiresAt && c.expiresAt.getTime() <= cutoff)
          .sort((a, b) => (a.expiresAt!.getTime() - b.expiresAt!.getTime()))
          .map((c) => [
            nameOf.get(c.userId)?.name ?? "—",
            nameOf.get(c.userId)?.employeeId ?? "—",
            courseOf.get(c.courseId)?.title ?? c.courseId,
            c.expiresAt!.toISOString().slice(0, 10),
            c.serial,
          ]),
      };
    }
    case "engagement": {
      const window = filters.daysWindow ?? 30;
      const cutoff = new Date(Date.now() - window * 24 * 3600_000);
      const events = await db
        .select({ userId: t.uiEvents.userId, n: sql<number>`count(*)::int` })
        .from(t.uiEvents)
        .where(and(userIds.length ? inArray(t.uiEvents.userId, userIds) : sql`false`, sql`ts > ${cutoff}`))
        .groupBy(t.uiEvents.userId);
      const activity = new Map(events.map((e) => [e.userId, e.n]));
      const points = await db
        .select({ userId: t.pointsLedger.userId, n: sql<number>`coalesce(sum(amount),0)::int` })
        .from(t.pointsLedger)
        .where(userIds.length ? inArray(t.pointsLedger.userId, userIds) : sql`false`)
        .groupBy(t.pointsLedger.userId);
      const pointsOf = new Map(points.map((p) => [p.userId, p.n]));
      return {
        title: `Engagement (${window}d)`,
        columns: ["Employee", "ID", "Role", "Active events", "Points", "Status"],
        rows: activeUsers.map((u) => [
          u.name,
          u.employeeId,
          u.role,
          activity.get(u.id) ?? 0,
          pointsOf.get(u.id) ?? 0,
          (activity.get(u.id) ?? 0) === 0 ? "INACTIVE" : "ACTIVE",
        ]),
      };
    }
    case "quiz_results": {
      const quizzes = await db.select().from(t.quizzes);
      const selectedModules = courseIds?.length ? await db.select().from(t.modules).where(inArray(t.modules.courseId, courseIds)) : [];
      const selectedLessons = selectedModules.length ? await db.select().from(t.lessons).where(inArray(t.lessons.moduleId, selectedModules.map(m => m.id))) : [];
      const selectedQuizIds = new Set(selectedLessons.flatMap(l => l.payload.quizId ? [l.payload.quizId] : []));
      const quizOf = new Map(quizzes.map((q) => [q.id, q]));
      const attempts = await db
        .select()
        .from(t.attempts)
        .where(userIds.length ? inArray(t.attempts.userId, userIds) : sql`false`).orderBy(t.attempts.id);
      const byQuiz = new Map<string, { attempts: number; passed: number; scoreSum: number }>();
      for (const a of attempts) {
        if (courseIds && !selectedQuizIds.has(a.quizId)) continue;
        if (a.state === "IN_PROGRESS" || a.state === "VOIDED" || !a.maxScore) continue;
        const s = byQuiz.get(a.quizId) ?? { attempts: 0, passed: 0, scoreSum: 0 };
        s.attempts++;
        if (a.passed) s.passed++;
        s.scoreSum += ((a.score ?? 0) / a.maxScore) * 100;
        byQuiz.set(a.quizId, s);
      }
      return {
        title: "Quiz results",
        columns: ["Quiz", "Attempts", "Pass rate %", "Avg score %"],
        rows: [...byQuiz.entries()].map(([qid, s]) => [
          quizOf.get(qid)?.title ?? qid,
          s.attempts,
          s.attempts ? Math.round((s.passed / s.attempts) * 100) : 0,
          s.attempts ? Math.round(s.scoreSum / s.attempts) : 0,
        ]),
      };
    }
  }
}

export function toCsv(result: ReportResult): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [result.columns.map(esc).join(","), ...result.rows.map((r) => r.map(esc).join(","))].join("\n");
}

/* ------------------------- Ask Reports (NL) ------------------------- */

export type QueryPlan = { report: ReportId; filters: ReportFilters; explanation: string };

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["report", "filters", "explanation"],
  properties: {
    report: { type: "string", enum: ["completion", "compliance", "transcript", "cert_expiry", "engagement", "quiz_results"] },
    filters: {
      type: "object",
      additionalProperties: false,
      properties: {
        courseTitle: { type: "string" },
        storeName: { type: "string" },
        complianceStatus: { type: "string", enum: ["ON_TRACK", "DUE_SOON", "OVERDUE", "COMPLETED", "COMPLETED_EXPIRING", "EXPIRED"] },
        daysWindow: { type: "number" },
        employeeId: { type: "string" },
      },
    },
    explanation: { type: "string" },
  },
} as const;

export async function planFromQuestion(question: string): Promise<QueryPlan> {
  if (aiAvailable()) {
    return structuredCall<QueryPlan>({
      route: "ask_reports",
      system:
        "Translate an HR admin's question about training data into a report query plan. Choose the single best report and only the filters the question implies. 'Who is overdue' → compliance with complianceStatus OVERDUE. Explanation: one sentence on what the plan does.",
      user: question,
      schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      effort: "low",
      maxTokens: 400,
    });
  }
  // deterministic offline planner
  const q = question.toLowerCase();
  const filters: ReportFilters = {};
  let report: ReportId = "completion";
  if (/(overdue|late|behind|not (yet )?complet|compliance)/.test(q)) {
    report = "compliance";
    if (/overdue|late|behind/.test(q)) filters.complianceStatus = "OVERDUE";
  } else if (/certificat|expir/.test(q)) report = "cert_expiry";
  else if (/inactive|engag|active|login/.test(q)) report = "engagement";
  else if (/quiz|exam|score|pass rate/.test(q)) report = "quiz_results";
  else if (/transcript|history/.test(q)) report = "transcript";
  const storeMatch = q.match(/store\s+([\p{L}\d]+)|in\s+([\p{L}]+)\s+(?:hypermarket|store|mall)/u);
  if (storeMatch) filters.storeName = storeMatch[1] ?? storeMatch[2];
  const knownStores = ["khalidiyah", "mushrif", "barsha", "silicon"];
  for (const s of knownStores) if (q.includes(s)) filters.storeName = s;
  const courseMatch = q.match(/on\s+([\w &]+?)(?:\?|$| in | at | for )/);
  if (courseMatch && !/overdue|training/.test(courseMatch[1])) filters.courseTitle = courseMatch[1].trim();
  for (const known of ["food safety", "customer service", "fire", "pos", "cash"]) {
    if (q.includes(known)) filters.courseTitle = known;
  }
  const days = q.match(/(\d+)\s*days?/);
  if (days) filters.daysWindow = Number(days[1]);
  return { report, filters, explanation: "Offline planner: keyword-matched report and filters (connect an AI key for full natural-language planning)." };
}

export function narrate(result: ReportResult, plan: QueryPlan): string {
  const n = result.rows.length;
  if (n === 0) return `No rows match — ${plan.explanation}`;
  if (plan.report === "compliance" && plan.filters.complianceStatus === "OVERDUE") {
    return `${n} enrollment(s) are overdue${plan.filters.courseTitle ? ` on “${plan.filters.courseTitle}”` : ""}${plan.filters.storeName ? ` in ${plan.filters.storeName}` : ""}.`;
  }
  if (plan.report === "cert_expiry") return `${n} certificate(s) expire within ${plan.filters.daysWindow ?? 90} days. Renewal training is auto-assigned by the recert loop.`;
  if (plan.report === "engagement") return `${n} people in scope; ${result.rows.filter((r) => r[5] === "INACTIVE").length} have no activity in the window.`;
  return `${n} row(s) returned. ${plan.explanation}`;
}
