"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";

export async function replyToTicketAction(ticketId: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const [ticket] = await db.select().from(t.hrTickets).where(eq(t.hrTickets.id, ticketId)).limit(1);
  if (!ticket || ticket.userId !== user.id || ticket.state === "RESOLVED") return;
  const body = String(form.get("body") ?? "").trim();
  if (!body) return;
  await db.insert(t.hrTicketMessages).values({ id: id(), ticketId, authorId: user.id, body: body.slice(0, 4000) });
  revalidatePath(`/ask-hr/tickets/${ticketId}`);
}
