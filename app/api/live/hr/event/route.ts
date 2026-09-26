import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { auditHrTurn } from "@/lib/hr/assistant";
import { detectLanguage } from "@/lib/hr/guardrails";
import { createTicketFromConversation } from "@/lib/hr/tickets";
import { liveAvailable, logLiveUsage } from "@/lib/live/gemini";
import { runHrTool } from "@/lib/live/hr-voice";
import { HR_TOOL_NAMES, HrEventBody } from "@/lib/live/shared";

export const maxDuration = 60;

/** Last policy search per conversation — in-process, used only to audit ungrounded assistant turns. */
const lastSearchAt = new Map<string, number>();
const UNGROUNDED_WINDOW_MS = 90_000;

/**
 * Voice conversation events (spec FR-14.3): transcript persistence, tool calls
 * (retrieval with guardrails; escalation needs on-screen confirmation), and the
 * session's cost row. Every call re-checks conversation ownership.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const parsed = HrEventBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const body = parsed.data;
  const [conv] = await db.select().from(t.hrConversations).where(eq(t.hrConversations.id, body.conversationId)).limit(1);
  if (!conv || conv.userId !== user.id) return new Response("Not found", { status: 404 });

  switch (body.type) {
    case "turn": {
      for (const turn of body.turns) {
        await db.insert(t.hrMessages).values({
          id: id(),
          conversationId: conv.id,
          role: turn.role,
          content: turn.text,
          citations: turn.role === "assistant" ? (turn.citations ?? []) : null,
        });
        const searched = (lastSearchAt.get(conv.id) ?? 0) > Date.now() - UNGROUNDED_WINDOW_MS;
        if (turn.role === "assistant" && turn.text.length > 160 && !searched) {
          after(() =>
            auditHrTurn(
              { userId: user.id, language: detectLanguage(turn.text), query: "[voice] assistant turn without a search", piiRedacted: false },
              { guardrail: "ungrounded", answer: turn.text.slice(0, 2000) },
            ),
          );
        }
      }
      return Response.json({ ok: true });
    }
    case "tool": {
      if (!(HR_TOOL_NAMES as readonly string[]).includes(body.name)) return new Response("Unknown tool", { status: 400 });
      const result = await runHrTool({ user, conversationId: conv.id, name: body.name, args: body.args, mock: !liveAvailable() });
      if (body.name === "search_hr_policy" || body.name === "search_course_content" || body.name === "my_training_status") lastSearchAt.set(conv.id, Date.now());
      return Response.json(result);
    }
    case "escalate": {
      const created = await createTicketFromConversation(user, conv.id, body.previewVersion, body.subject);
      if (!created) return new Response("Not found", { status: 404 });
      if ("previewChanged" in created) return Response.json({ code: "preview_changed" }, { status: 409 });
      return Response.json({ ok: true, ticketId: created.ticketId });
    }
    case "end": {
      lastSearchAt.delete(conv.id);
      if (body.usage && liveAvailable()) await logLiveUsage("hr_live", body.model ?? "unknown", body.usage, body.durationMs ?? 0);
      return Response.json({ ok: true });
    }
  }
}
