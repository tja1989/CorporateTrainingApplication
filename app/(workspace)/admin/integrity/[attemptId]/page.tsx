import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Button, Card, Chip, Field, Input, PageTitle, cx } from "@/components/ui";
import { clearAttemptAction, voidAttemptAction } from "./actions";

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<string, string> = {
  red: "bg-destructive-tint text-destructive-text",
  orange: "bg-warning-tint text-warning-fg",
  info: "bg-surface-2 text-muted",
};

export default async function IntegrityDetailPage({ params }: { params: Promise<{ attemptId: string }> }) {
  await requireRole("ADMIN");
  const { attemptId } = await params;
  const [attempt] = await db.select().from(t.attempts).where(eq(t.attempts.id, attemptId)).limit(1);
  if (!attempt) notFound();
  const [user] = await db.select().from(t.users).where(eq(t.users.id, attempt.userId)).limit(1);
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, attempt.quizId)).limit(1);
  const events = await db
    .select()
    .from(t.integrityEvents)
    .where(eq(t.integrityEvents.attemptId, attempt.id))
    .orderBy(asc(t.integrityEvents.ts));

  const startMs = attempt.startedAt.getTime();
  const open = attempt.state !== "CLEARED" && attempt.state !== "VOIDED";

  return (
    <div className="animate-slide-up mx-auto max-w-2xl">
      <PageTitle
        sub={`${user?.name ?? "—"} (${user?.employeeId ?? "—"}) · started ${attempt.startedAt.toISOString().slice(0, 16).replace("T", " ")} · ${attempt.state}${attempt.maxScore ? ` · ${Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100)}%` : ""}`}
      >
        {quiz?.title ?? "Attempt"}
      </PageTitle>

      <Card className="mb-4 p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">Event timeline</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No events — a clean sitting.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((e) => {
              const offset = Math.max(0, Math.round((e.ts.getTime() - startMs) / 1000));
              return (
                <li key={e.id} className={cx("flex items-center gap-3 rounded-control px-3 py-1 text-sm", SEVERITY_STYLE[e.severity])}>
                  <span className="bidi-isolate w-12 font-mono text-xs">+{Math.floor(offset / 60)}:{String(offset % 60).padStart(2, "0")}</span>
                  <span className="flex-1">{e.kind.replace(/_/g, " ")}</span>
                  <span className="text-xs uppercase">{e.severity}</span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">
          Connection-loss and platform-capability events are informational and never count against the learner. IME/keyboard
          switching and OS notifications commonly cause brief blurs.
        </p>
      </Card>

      {open ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <form action={clearAttemptAction.bind(null, attempt.id)}>
            <Button type="submit">Clear — result stands</Button>
          </form>
          <form action={voidAttemptAction.bind(null, attempt.id)} className="flex items-end gap-2">
            <Field label="Void reason (required)">
              <Input name="reason" required placeholder="e.g. second person assisting confirmed" />
            </Field>
            <Button type="submit" variant="destructive">Void — grant fresh attempt</Button>
          </form>
        </div>
      ) : (
        <Chip variant={attempt.state === "CLEARED" ? "success" : "neutral"}>
          {attempt.state === "CLEARED" ? "Cleared — result stands" : `Voided: ${attempt.voidReason ?? ""} (fresh attempt granted)`}
        </Chip>
      )}
    </div>
  );
}
