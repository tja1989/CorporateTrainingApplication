import { desc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { HrChat } from "./chat";
import { Card, Chip } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AskHrPage() {
  const user = await requireUser();
  const tickets = await db
    .select()
    .from(t.hrTickets)
    .where(eq(t.hrTickets.userId, user.id))
    .orderBy(desc(t.hrTickets.createdAt))
    .limit(5);

  // The conversation flows in the page (no inner scroll region — spec §10.7
  // v1.2); the composer sticks to the bottom of the viewport.
  return (
    <div className="animate-slide-up mx-auto max-w-2xl">
      {tickets.length > 0 ? (
        <div className="mb-4 flex flex-col gap-2" aria-label="Your HR tickets">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/ask-hr/tickets/${ticket.id}`}>
              <Card className="pressable flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface-2">
                <span className="truncate">✉ {ticket.subject}</span>
                <Chip variant={ticket.state === "RESOLVED" ? "success" : ticket.state === "IN_PROGRESS" ? "warning" : "neutral"}>
                  {ticket.state.toLowerCase().replace("_", " ")}
                </Chip>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
      <Link href="/ask-hr/live" className="mb-4 block">
        <Card className="pressable flex items-center justify-between gap-3 p-3 hover:bg-surface-2">
          <span className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-ai-tint text-lg text-ai-fg" aria-hidden>🎙</span>
            <span>
              <span className="block text-sm font-medium">Talk to the assistant</span>
              <span className="block text-xs text-muted">Live voice — same policies, same citations, same guardrails.</span>
            </span>
          </span>
          <Chip variant="ai">AI</Chip>
        </Card>
      </Link>
      <HrChat sharedDevice={user.session.shared} />
    </div>
  );
}
