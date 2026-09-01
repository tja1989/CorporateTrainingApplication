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

  return (
    <div className="animate-slide-up mx-auto flex h-[calc(100dvh-9rem)] max-w-2xl flex-col md:h-[calc(100dvh-7rem)]">
      {tickets.length > 0 ? (
        <div className="mb-3 flex flex-col gap-1.5">
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
      <HrChat sharedDevice={user.session.shared} />
    </div>
  );
}
