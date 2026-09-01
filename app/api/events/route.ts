import { db, t } from "@/lib/db/client";
import { currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";

const ALLOWED = new Set(["citation_click", "tutor_open", "app_open", "hr_citation_click"]);

/** Lightweight UI telemetry (spec §15 — citation click-through etc.). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as { kind: string; payload?: Record<string, unknown> };
  if (!ALLOWED.has(body.kind)) return new Response("Bad request", { status: 400 });
  await db.insert(t.uiEvents).values({ id: id(), userId: user.id, kind: body.kind, payload: body.payload ?? {} });
  return Response.json({ ok: true });
}
