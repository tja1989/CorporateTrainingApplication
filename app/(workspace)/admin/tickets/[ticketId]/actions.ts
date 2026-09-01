"use server";

import { revalidatePath } from "next/cache";
import { setFlash } from "@/lib/flash";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { notify } from "@/lib/notify";

export async function adminReplyAction(ticketId: string, form: FormData): Promise<void> {
  const admin = await requireRole("ADMIN");
  const [ticket] = await db.select().from(t.hrTickets).where(eq(t.hrTickets.id, ticketId)).limit(1);
  if (!ticket) return;
  const body = String(form.get("body") ?? "").trim();
  if (!body) return;
  await db.insert(t.hrTicketMessages).values({ id: id(), ticketId, authorId: admin.id, body: body.slice(0, 4000) });
  await db.update(t.hrTickets).set({ state: "IN_PROGRESS", assigneeId: admin.id }).where(eq(t.hrTickets.id, ticketId));
  await notify(ticket.userId, "hr_ticket_updated", { subject: ticket.subject, ticketId });
  await setFlash("Reply sent — the employee has been notified.");
  revalidatePath(`/admin/tickets/${ticketId}`);
}

export async function resolveTicketAction(ticketId: string): Promise<void> {
  const admin = await requireRole("ADMIN");
  const [ticket] = await db.select().from(t.hrTickets).where(eq(t.hrTickets.id, ticketId)).limit(1);
  if (!ticket) return;
  await db.update(t.hrTickets).set({ state: "RESOLVED", assigneeId: admin.id }).where(eq(t.hrTickets.id, ticketId));
  await notify(ticket.userId, "hr_ticket_updated", { subject: ticket.subject, ticketId });
  await setFlash("Ticket resolved.");
  revalidatePath(`/admin/tickets/${ticketId}`);
}
