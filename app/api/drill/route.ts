import { apiUser as currentUser } from "@/lib/auth/guard";
import { buildDrillSession, recordDrillAnswer, completeDrillSession } from "@/lib/quiz/drill";
import { scoreQuestion, type Answer } from "@/lib/quiz/scoring";
import { db, t } from "@/lib/db/client";
import { eq } from "drizzle-orm";

/** GET = build a session; POST = record one answer (instant feedback) or finish. */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const questions = await buildDrillSession(user.id);
  return Response.json({
    questions: questions.map((q) => ({
      questionId: q.id,
      type: q.type,
      prompt: q.body.prompt,
      points: q.points,
      stimulus: q.body.stimulus ?? null,
      left: q.body.pairs?.map(pair => pair.left) ?? null,
      right: q.body.pairs?.map(pair => pair.right) ?? null,
      orderItems: q.body.orderItems ?? null,
      options: q.type === "truefalse" ? ["True", "False"] : (q.body.options ?? null),
    })),
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json()) as
    | { done: true }
    | { questionId: string; answer: Answer; confidence: "sure" | "unsure" | null };

  if ("done" in body) {
    await completeDrillSession(user.id);
    return Response.json({ ok: true });
  }

  const [q] = await db.select().from(t.questions).where(eq(t.questions.id, body.questionId)).limit(1);
  if (!q) return new Response("Not found", { status: 404 });
  const earned = scoreQuestion({ type: q.type, points: q.points, body: q.body }, body.answer) ?? 0;
  const correct = earned >= q.points;
  await recordDrillAnswer(user.id, q.id, correct, body.confidence);
  return Response.json({
    correct,
    explanation: q.body.explanation ?? null,
    correctAnswer:
      q.type === "matching" ? (q.body.pairs ?? []).map(pair => `${pair.left}: ${pair.right}`).join("; ") || null
      : q.type === "ordering" ? (q.body.orderItems ?? []).join(" → ") || null
      : q.type === "fill_blank"
        ? (q.body.acceptedAnswers?.[0] ?? null)
        : q.type === "truefalse"
          ? (q.body.correct?.[0] === 0 ? "True" : "False")
          : (q.body.correct ?? []).map((i) => q.body.options?.[i]).join(", ") || null,
  });
}
