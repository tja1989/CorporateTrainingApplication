import { WorkspaceForm } from "./workspace-form";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { renderNotification } from "@/lib/notify";
import { Card, PageTitle, EmptyState, Chip, Button, ButtonAnchor } from "@/components/ui";

export async function InboxList({ userId, page = "1" }: { userId: string; page?: string }) {
  const [counts] = await db.select({ total: sql<number>`count(*)::int`, unread: sql<number>`count(*) FILTER (WHERE ${t.notifications.readAt} IS NULL)::int` })
    .from(t.notifications).where(eq(t.notifications.userId, userId));
  const pages = Math.max(1, Math.ceil(counts.total / 50));
  const requested = /^\d+$/.test(page) ? Number(page) : 1;
  const current = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const rows = await db
    .select()
    .from(t.notifications)
    .where(eq(t.notifications.userId, userId))
    .orderBy(desc(t.notifications.sentAt), desc(t.notifications.id))
    .limit(50).offset((current - 1) * 50);
  async function markAllRead() {
    "use server";
    const user = await requireUser();
    await db.update(t.notifications).set({ readAt: new Date() }).where(and(eq(t.notifications.userId, user.id), isNull(t.notifications.readAt)));
    revalidatePath("/", "layout");
  }
  const unread = counts.unread;

  return (
    <div className="animate-slide-up">
      <PageTitle sub={`${unread} unread · Updates about your learning and HR requests.`}>Notifications</PageTitle>
      {unread > 0 ? <WorkspaceForm action={markAllRead} className="mb-4"><Button variant="secondary" type="submit">Mark all as read</Button></WorkspaceForm> : null}
      {rows.length === 0 ? (
        <EmptyState icon="bell" title="Nothing yet" />
      ) : (
        <div className="flex max-w-2xl flex-col gap-2">
          {rows.map((n) => {
            const { title, body } = renderNotification(n.kind, n.payload);
            return (
              <Card key={n.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-base font-medium">{title}</h2><Chip variant={!n.readAt ? "accent" : "neutral"}>{n.readAt ? "Read" : "Unread"}</Chip>
                  <span className="shrink-0 text-xs text-muted">{n.sentAt.toISOString().slice(0, 10)}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{body}</p><a className="mt-2 inline-flex touch-target items-center text-sm text-link underline" href={notificationHref(n.kind, n.payload)}>Open update</a>
              </Card>
            );
          })}
        </div>
      )}
      {pages > 1 ? <nav aria-label="Notification pages" className="mt-5 flex flex-wrap items-center gap-3">
        {current > 1 ? <ButtonAnchor variant="secondary" href={`?page=${current - 1}`}>Newer notifications</ButtonAnchor> : null}
        <span className="text-sm text-muted">Page {current} of {pages}</span>
        {current < pages ? <ButtonAnchor variant="secondary" href={`?page=${current + 1}`}>Older notifications</ButtonAnchor> : null}
      </nav> : null}
    </div>
  );
}

function notificationHref(kind: string, payload: Record<string, unknown>): string {
  const value = (name: string) => typeof payload[name] === "string" ? encodeURIComponent(payload[name] as string) : null;
  if (kind === "hr_ticket_updated" && value("ticketId")) return `/ask-hr/tickets/${value("ticketId")}`;
  if (kind.startsWith("oral_check") && value("lessonId")) return `/lesson/${value("lessonId")}/interview`;
  if (kind === "quiz_graded" && value("quizId")) return `/quiz/${value("quizId")}`;
  if (value("pathId")) return `/path/${value("pathId")}`;
  if (value("courseId")) return `/course/${value("courseId")}`;
  if (kind === "manager_digest") return "/team";
  return kind === "hr_ticket_updated" ? "/ask-hr" : kind === "quiz_graded" ? "/learn" : "/profile";
}
