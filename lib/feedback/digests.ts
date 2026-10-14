import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { DEFAULT_TZ, localDate } from "@/lib/time";
import { canonicalRole } from "@/lib/auth/roles";
import { notify } from "@/lib/notify";
import { feedbackPeriod } from "./periods";
import { feedbackReport } from "./reports";
import { lockFeedback } from "./service";
import type { FeedbackKind } from "./types";
export function previousFeedbackPeriod(
  kind: "week" | "month",
  now = new Date(),
) {
  const current = feedbackPeriod(kind, now, DEFAULT_TZ);
  return feedbackPeriod(
    kind,
    new Date(current.start.getTime() - 1),
    DEFAULT_TZ,
  );
}
export function feedbackDigestKey(
  interval: "week" | "month",
  kind: FeedbackKind,
  recipientId: string,
  start: Date,
) {
  return `feedback:${interval}:${kind}:${recipientId}:${start.toISOString()}`;
}
export class FeedbackDigestFailure extends Error {
  constructor(
    public stats: { sent: number; alreadySent: number },
    public failures: string[],
  ) {
    super(
      `Feedback digest partial failure: ${JSON.stringify({ ...stats, failures })}`,
    );
  }
}
export async function runFeedbackDigests(
  interval: "week" | "month",
  now = new Date(),
): Promise<{ sent: number; alreadySent: number }> {
  if (!["week", "month"].includes(interval))
    throw new Error("Choose week or month.");
  const period = previousFeedbackPeriod(interval, now),
    stats = { sent: 0, alreadySent: 0 },
    failures: string[] = [];
  const recipients = await db
    .select()
    .from(t.users)
    .where(
      and(
        inArray(t.users.role, [
          "HR_HEAD",
          "DEPARTMENT_HEAD",
          "MANAGER",
          "INSTRUCTOR",
        ]),
        eq(t.users.passwordState, "ACTIVE"),
        isNull(t.users.erasedAt),
      ),
    );
  for (const person of recipients)
    for (const kind of ["course", "instructor"] as const) {
      const role = canonicalRole(person.role)!;
      const key = feedbackDigestKey(interval, kind, person.id, period.start),
        afterCommit: Array<() => Promise<void>> = [];
      try {
        const delivered = await db.transaction(async (tx) => {
          await lockFeedback(tx, `digest:${key}`);
          const match = and(
            eq(t.feedbackDigestRuns.recipientId, person.id),
            eq(t.feedbackDigestRuns.intervalKind, interval),
            eq(t.feedbackDigestRuns.kind, kind),
            eq(t.feedbackDigestRuns.periodStart, period.start),
          );
          const [done] = await tx
            .select()
            .from(t.feedbackDigestRuns)
            .where(match)
            .limit(1);
          if (done) return false;
          const report = await feedbackReport(
            { id: person.id, role, departmentId: person.departmentId },
            { kind, period },
            tx,
          );
          const query = new URLSearchParams({
            kind,
            period: "custom",
            start: localDate(period.start, DEFAULT_TZ),
            end: localDate(new Date(period.end.getTime() - 1), DEFAULT_TZ),
          });
          await notify(
            person.id,
            kind === "course"
              ? "course_feedback_digest"
              : "instructor_feedback_digest",
            {
              intervalKind: interval,
              period: period.label,
              responses: report.responses,
              average: report.average,
              href: "/feedback?" + query,
            },
            key,
            undefined,
            { connection: tx, afterCommit },
          );
          await tx
            .insert(t.feedbackDigestRuns)
            .values({
              id: id(),
              recipientId: person.id,
              intervalKind: interval,
              kind,
              periodStart: period.start,
              periodEnd: period.end,
            });
          return true;
        });
        await Promise.allSettled(afterCommit.map((deliver) => deliver()));
        if (delivered) stats.sent++;
        else stats.alreadySent++;
      } catch (error) {
        failures.push(
          `${person.id}/${kind}: ${error instanceof Error ? error.message : "Delivery failed"}`,
        );
      }
    }
  if (failures.length) throw new FeedbackDigestFailure(stats, failures);
  return stats;
}
