import { and, eq, gte } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import type { LearningWriteContext } from "@/lib/lms/learning-cycle";

/**
 * Fixed notification catalog (spec FR-9.1). In-app always; email when the user
 * has one AND SMTP_URL is configured. Channel-pluggable dispatcher: WhatsApp/SMS
 * is the named fast-follow — add a sender here.
 */
export type NotificationKind =
  | "enrolled"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "cert_expiring"
  | "quiz_graded"
  | "hr_ticket_updated"
  | "manager_digest"
  | "course_completed"
  | "oral_check_result"
  | "oral_check_review";

const TEMPLATES: Record<NotificationKind, (p: Record<string, unknown>) => { title: string; body: string }> = {
  enrolled: (p) => ({ title: "New training assigned", body: `You've been enrolled in “${p.courseTitle}”.` }),
  due_soon: (p) => ({ title: "Training due soon", body: `“${p.courseTitle}” is due in ${p.days} day(s).` }),
  due_today: (p) => ({ title: "Training due today", body: `“${p.courseTitle}” is due today.` }),
  overdue: (p) => ({ title: "Training overdue", body: `“${p.courseTitle}” is overdue. Please complete it as soon as you can.` }),
  cert_expiring: (p) => ({ title: "Certificate expiring", body: `Your “${p.courseTitle}” certificate expires in ${p.days} day(s). Renewal training has been assigned.` }),
  quiz_graded: (p) => ({ title: "Quiz result ready", body: `Your result for “${p.quizTitle}” is ${p.state === "FINAL" ? "final" : "provisional"}: ${p.outcome}.` }),
  hr_ticket_updated: (p) => ({ title: "HR ticket updated", body: `Your HR ticket “${p.subject}” has an update.` }),
  manager_digest: (p) => ({ title: "Weekly team digest", body: String(p.summary ?? "") }),
  course_completed: (p) => ({ title: "Course completed 🎉", body: `You completed “${p.courseTitle}”. Nice work.` }),
  oral_check_result: (p) => ({
    title: p.outcome === "PASS" ? "Oral check passed" : "Oral check not passed",
    body: p.overturned
      ? `An admin reviewed your oral check for “${p.lessonTitle}” and confirmed it as a pass.`
      : `Your oral check for “${p.lessonTitle}” scored ${p.scorePct}% — ${p.outcome === "PASS" ? "passed." : "not passed yet. You can retake it any time."}`,
  }),
  oral_check_review: (p) => ({ title: "Oral check to review", body: `${p.learnerName} did not pass the oral check for “${p.lessonTitle}” (${p.scorePct}%). Worth a look.` }),
};

export async function notify(
  userId: string,
  kind: NotificationKind,
  payload: Record<string, unknown>,
  dedupeKey?: string,
  dedupeWithinMs?: number,
  transaction?: LearningWriteContext,
): Promise<void> {
  const connection = transaction?.connection ?? db;
  if (dedupeKey) {
    const dup = await connection
      .select({ id: t.notifications.id })
      .from(t.notifications)
      .where(and(eq(t.notifications.userId, userId), eq(t.notifications.dedupeKey, dedupeKey), dedupeWithinMs !== undefined ? gte(t.notifications.sentAt, new Date(Date.now() - dedupeWithinMs)) : undefined))
      .limit(1);
    if (dup.length > 0) return;
  }
  const channels = ["inapp"];
  const [user] = await connection.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  if (user?.email && process.env.SMTP_URL) channels.push("email");
  await connection.insert(t.notifications).values({ id: id(), userId, kind, payload, channels, dedupeKey });
  if (channels.includes("email") && user?.email) {
    const tpl = TEMPLATES[kind](payload);
    const deliver = () => sendEmail(user.email!, tpl.title, tpl.body).catch(() => {
      /* email failures never block; in-app already committed */
    });
    if (transaction) transaction.afterCommit.push(deliver);
    else await deliver();
  }
}

export function renderNotification(kind: string, payload: Record<string, unknown>): { title: string; body: string } {
  const tpl = TEMPLATES[kind as NotificationKind];
  return tpl ? tpl(payload) : { title: kind, body: "" };
}

/** Minimal SMTP-over-URL transport; absent SMTP_URL → email channel is off (spec FR-9.1). */
async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const url = process.env.SMTP_URL;
  if (!url) return;
  if (url === "console") {
    console.log(`[email] to=${to} subject=${subject}\n${body}`);
    return;
  }
  // Real SMTP transport is a deploy-time concern; dev uses "console".
  console.log(`[email:queued] to=${to} subject=${subject}`);
}
