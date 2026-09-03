import { desc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { renderNotification } from "@/lib/notify";
import { Card, PageTitle, EmptyState, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(t.notifications)
    .where(eq(t.notifications.userId, user.id))
    .orderBy(desc(t.notifications.sentAt))
    .limit(50);

  // mark all read (simple MVP behavior)
  await db.update(t.notifications).set({ readAt: new Date() }).where(eq(t.notifications.userId, user.id));

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Reminders and updates. Email copies go out when you have a work email on file.">Notifications</PageTitle>
      {rows.length === 0 ? (
        <EmptyState icon="bell" title="Nothing yet" body="Due-date reminders and updates will appear here." />
      ) : (
        <div className="flex max-w-2xl flex-col gap-2">
          {rows.map((n) => {
            const { title, body } = renderNotification(n.kind, n.payload);
            return (
              <Card key={n.id} className={cx("p-3", !n.readAt && "border-s-2 border-s-accent")}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-medium">{title}</h2>
                  <span className="shrink-0 text-xs text-muted">{n.sentAt.toISOString().slice(0, 10)}</span>
                </div>
                <p className="text-sm text-muted">{body}</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
