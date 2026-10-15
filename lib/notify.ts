import { and, eq, gte } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import type { LearningWriteContext } from "@/lib/lms/learning-cycle";
import { plural } from "@/lib/format";
import { statusLabel } from "@/lib/status";

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
  | "course_feedback_digest" | "instructor_feedback_digest"
  | "course_completed"
  | "oral_check_result"
  | "oral_check_review"
  | "course_submitted" | "course_approved" | "course_rejected" | "course_published" | "course_workflow_updated";

// Workflow updates read as a sentence about the course, not a status code.
const WORKFLOW_PHRASES: Record<string, string> = {
  DRAFT: "is back in draft",
  SUBMITTED: "is waiting for Department Head review",
  APPROVED: "is approved and ready to publish",
  REJECTED: "needs changes",
  LEGACY_PUBLISHED: "is published",
  PUBLISHED: "is published",
};

const TEMPLATES: Record<NotificationKind, (p: Record<string, unknown>) => { title: string; body: string }> = {
  course_feedback_digest:p=>({title:`${p.intervalKind==="week"?"Weekly":"Monthly"} course feedback`,body:`${p.period}: ${plural(Number(p.responses), "response")}. ${p.average==null?"No responses.":`Average rating ${p.average} / 5.`}`}),
  instructor_feedback_digest:p=>({title:`${p.intervalKind==="week"?"Weekly":"Monthly"} instructor feedback`,body:`${p.period}: ${plural(Number(p.responses), "response")}. ${p.average==null?"No responses.":`Average rating ${p.average} / 5.`}`}),
  course_submitted:p=>({title:"Course awaiting approval",body:`“${p.courseTitle}” is ready for Department Head review.`}),
  course_approved:p=>({title:"Course approved",body:`“${p.courseTitle}” is approved and ready for HR publication.`}),
  course_rejected:p=>({title:"Course needs changes",body:`“${p.courseTitle}” was rejected. ${p.comment ?? ""}`}),
  course_published:p=>({title:"Course published",body:`“${p.courseTitle}” is available for rollout.`}),
  course_workflow_updated:p=>({title:"Course workflow updated",body:`“${p.courseTitle}” ${WORKFLOW_PHRASES[String(p.state)] ?? `is now ${statusLabel(String(p.state)).label.toLowerCase()}`}. ${p.comment ?? ""}`}),
  enrolled: (p) => ({ title: "New training assigned", body: `You've been enrolled in “${p.courseTitle}”.` }),
  due_soon: (p) => ({ title: "Training due soon", body: `“${p.courseTitle}” is due in ${plural(Number(p.days), "day")}.` }),
  due_today: (p) => ({ title: "Training due today", body: `“${p.courseTitle}” is due today.` }),
  overdue: (p) => ({ title: "Training overdue", body: `“${p.courseTitle}” is overdue. Please complete it as soon as you can.` }),
  cert_expiring: (p) => ({ title: "Certificate expiring", body: `Your “${p.courseTitle}” certificate expires in ${plural(Number(p.days), "day")}. Renewal training has been assigned.` }),
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
