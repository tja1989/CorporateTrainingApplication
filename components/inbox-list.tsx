import { desc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { renderNotification } from "@/lib/notify";
import { Card, PageTitle, EmptyState, cx } from "@/components/ui";

export async function InboxList({ userId }: { userId: string }) {
  const rows = await db
    .select()
    .from(t.notifications)
    .where(eq(t.notifications.userId, userId))
    .orderBy(desc(t.notifications.sentAt))
    .limit(50);
  await db.update(t.notifications).set({ readAt: new Date() }).where(eq(t.notifications.userId, userId));

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Digests and updates.">Notifications</PageTitle>
      {rows.length === 0 ? (
        <EmptyState icon="bell" title="Nothing yet" />
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
