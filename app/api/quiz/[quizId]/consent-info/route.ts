import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";

export async function GET(_req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { quizId } = await params;
  const [quiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.id, quizId)).limit(1);
  if (!quiz) return new Response("Not found", { status: 404 });
  return Response.json({ integrityMode: quiz.settings.integrityMode });
}

/** Log the integrity-consent acknowledgement (spec FR-7.4). */
export async function POST(_req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { quizId } = await params;
  await db.insert(t.consents).values({ id: id(), userId: user.id, kind: "integrity", version: `quiz:${quizId}` });
  return Response.json({ ok: true });
}
