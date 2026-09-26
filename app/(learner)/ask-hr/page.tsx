import { Icon, IconDisc } from "@/components/icons";
import { desc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { HrChat } from "./chat";
import { Card, Chip, PageTitle } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AskHrPage() {
  const user = await requireUser();
  const tickets = await db
    .select()
    .from(t.hrTickets)
    .where(eq(t.hrTickets.userId, user.id))
    .orderBy(desc(t.hrTickets.createdAt))
    .limit(50);

  // The conversation flows in the page (no inner scroll region — spec §10.7
  // v1.2); the composer sticks to the bottom of the viewport.
  return (
    <div className="animate-slide-up mx-auto max-w-2xl">
      <PageTitle sub="Ask about company policies, with sources you can read.">HR Help</PageTitle>
      {tickets.length > 0 ? (
        <details className="mb-5 rounded-card border border-border bg-surface p-4"><summary className="cursor-pointer font-medium">Your HR tickets ({tickets.length})</summary><div className="mt-3 flex flex-col gap-2" aria-label="Your HR tickets">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/ask-hr/tickets/${ticket.id}`}>
              <Card className="lift pressable flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface-2">
                <span className="flex min-w-0 items-center gap-2"><Icon name="mail" size={14} className="shrink-0 text-muted" /><span className="truncate">{ticket.subject}</span></span>
                <Chip variant={ticket.state === "RESOLVED" ? "success" : ticket.state === "IN_PROGRESS" ? "warning" : "neutral"}>
                  {ticket.state.toLowerCase().replace("_", " ")}
                </Chip>
              </Card>
            </Link>
          ))}
        </div></details>
      ) : null}
      <Link href="/ask-hr/live" className="mb-4 block">
        <Card className="lift pressable flex items-center justify-between gap-3 p-3 hover:bg-surface-2">
          <span className="flex items-center gap-3">
            <IconDisc name="mic" tone="ai" size={48} />
            <span>
              <span className="block text-sm font-medium">Talk to your assistant</span>
              <span className="block text-xs text-muted">Live voice — HR policy, your courses, and what&#39;s due, with sources cited.</span>
            </span>
          </span>
          <Chip variant="ai">AI</Chip>
        </Card>
      </Link>
      <HrChat sharedDevice={user.session.shared} />
    </div>
  );
}
