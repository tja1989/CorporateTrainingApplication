import { asc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { AiSurface, Button, Card, Chip, PageTitle, EmptyState, Input } from "@/components/ui";
import { approveDraftAction, discardDraftAction, confirmGradeAction, adjustGradeAction, markInterviewReviewedAction } from "./actions";
import { pendingInterviewReviews } from "@/lib/live/store";

export const dynamic = "force-dynamic";

/** Review queues (spec §11.13): AI question drafts + AI grading confirmations. */
export default async function ReviewsPage() {
  await requireRole("ADMIN");

  const pendingGrades = await db
    .select()
    .from(t.gradingReviews)
    .where(eq(t.gradingReviews.state, "PENDING"))
    .orderBy(asc(t.gradingReviews.createdAt));
  const attemptIds = [...new Set(pendingGrades.map((g) => g.attemptId))];
  const attempts = attemptIds.length ? await db.select().from(t.attempts).where(inArray(t.attempts.id, attemptIds)) : [];
  const attemptOf = new Map(attempts.map((a) => [a.id, a]));
  const userIds = [...new Set(attempts.map((a) => a.userId))];
  const users = userIds.length ? await db.select().from(t.users).where(inArray(t.users.id, userIds)) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const gradeQids = [...new Set(pendingGrades.map((g) => g.questionId))];

  const drafts = await db.select().from(t.questions).where(eq(t.questions.status, "DRAFT")).orderBy(asc(t.questions.createdAt));
  const allQids = [...new Set([...gradeQids, ...drafts.map((d) => d.id)])];
  const questionRows = allQids.length ? await db.select().from(t.questions).where(inArray(t.questions.id, allQids)) : [];
  const questionOf = new Map(questionRows.map((q) => [q.id, q]));
  const oralReviews = await pendingInterviewReviews();

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Human judgement gates: AI-graded answers and AI-drafted questions.">Review queues</PageTitle>

      <section className="mb-8 max-w-3xl" aria-label="Grading reviews">
        <h2 className="mb-2 text-sm font-medium text-muted">AI-graded answers awaiting confirmation ({pendingGrades.length})</h2>
        {pendingGrades.length === 0 ? (
          <EmptyState title="Nothing pending" body="Free-text answers that AI fails, grades with low confidence, or that learners appeal land here." />
        ) : (
          <div className="flex flex-col gap-3">
            {pendingGrades.map((review) => {
              const attempt = attemptOf.get(review.attemptId);
              const q = questionOf.get(review.questionId);
              const answers = (attempt?.answers ?? {}) as Record<string, { kind: string; text?: string }>;
              const answerText = answers[review.questionId]?.text ?? "(no answer)";
              const aiTotal = (review.aiScores ?? []).reduce((s, c) => s + c.points, 0);
              const aiMax = (review.aiScores ?? []).reduce((s, c) => s + c.max, 0);
              return (
                <Card key={review.id} className="p-4 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{nameOf.get(attempt?.userId ?? "") ?? "—"}</span>
                    <Chip variant={review.reason === "ai_fail" ? "destructive" : review.reason === "appeal" ? "warning" : "neutral"}>
                      {review.reason.replace("_", " ")}
                    </Chip>
                    <Chip variant="ai">AI: {aiTotal}/{aiMax} · conf {Math.round((review.aiConfidence ?? 0) * 100)}%</Chip>
                  </div>
                  <p className="mb-1 text-muted">{q?.body.prompt}</p>
                  <blockquote className="mb-2 rounded-control bg-surface-2 p-2 whitespace-pre-wrap">{answerText}</blockquote>
                  {review.aiRationale ? <AiSurface variant="block" className="mb-2" label="AI rationale">{review.aiRationale}</AiSurface> : null}
                  <div className="flex flex-wrap items-end gap-2">
                    <form action={confirmGradeAction.bind(null, review.id)}>
                      <Button type="submit" variant="secondary">Confirm AI grade</Button>
                    </form>
                    <form action={adjustGradeAction.bind(null, review.id)} className="flex items-end gap-2">
                      <div>
                        <label className="mb-1 block text-xs text-muted">Adjusted points (of {aiMax})</label>
                        <Input name="points" type="number" min={0} max={aiMax} step={0.5} defaultValue={aiTotal} className="w-[112px]" />
                      </div>
                      <Button type="submit">Adjust & finalize</Button>
                    </form>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="max-w-3xl" aria-label="AI question drafts">
        <h2 className="mb-2 text-sm font-medium text-muted">AI-drafted questions ({drafts.length}) — never published without approval</h2>
        {drafts.length === 0 ? (
          <EmptyState title="No drafts" body="Questions generated from ingested videos appear here for approval." />
        ) : (
          <div className="flex flex-col gap-3">
            {drafts.map((d) => (
              <Card key={d.id} className="p-4 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  <Chip variant="ai">AI draft · {d.type}</Chip>
                  {d.source?.startSec !== undefined ? <span className="text-xs text-muted">from video @ {d.source?.startSec}s</span> : null}
                </div>
                <p className="mb-1 font-medium">{d.body.prompt}</p>
                {d.body.options ? (
                  <ul className="mb-1 flex flex-col gap-1 text-muted">
                    {d.body.options.map((opt, i) => (
                      <li key={i}>{d.body.correct?.includes(i) ? "✓ " : "· "}{opt}</li>
                    ))}
                  </ul>
                ) : null}
                {d.body.acceptedAnswers ? <p className="mb-1 text-muted">Accepted: {d.body.acceptedAnswers.join(", ")}</p> : null}
                {d.body.explanation ? <p className="mb-2 text-xs text-muted">{d.body.explanation}</p> : null}
                <div className="flex gap-2">
                  <form action={approveDraftAction.bind(null, d.id)}>
                    <Button type="submit" variant="secondary">Approve</Button>
                  </form>
                  <form action={discardDraftAction.bind(null, d.id)}>
                    <Button type="submit" variant="ghost">Discard</Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-3xl" aria-label="Oral check reviews">
        <h2 className="mb-2 text-sm font-medium text-muted">Oral checks needing a human look ({oralReviews.length})</h2>
        {oralReviews.length === 0 ? (
          <EmptyState icon="🎙" title="No oral checks waiting" body="Checks that score under the pass mark, or were graded after the session ended, land here." />
        ) : (
          <div className="flex flex-col gap-3">
            {oralReviews.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.learnerName}</span>
                  <span className="flex gap-2">
                    <Chip variant="warning">{r.scorePct ?? 0}% · needs review</Chip>
                    {r.evaluationSource !== "model" ? <Chip variant="neutral">graded {r.evaluationSource === "mock" ? "offline" : "after session"}</Chip> : null}
                  </span>
                </div>
                <p className="mb-2 text-xs text-muted">
                  {r.lessonTitle} · {r.courseTitle} · {r.completedAt?.toISOString().slice(0, 16).replace("T", " ") ?? ""}
                </p>
                {r.evaluation ? (
                  <AiSurface variant="block" label="AI evaluation" mock={r.evaluationSource === "mock"} className="mb-2 block max-w-full">
                    {r.evaluation.overall_summary ? <p className="mb-2">{r.evaluation.overall_summary}</p> : null}
                    <ol className="flex flex-col gap-1 text-xs">
                      {r.evaluation.questions.map((q, i) => (
                        <li key={i}>
                          <span className="font-medium">{q.question}</span> — {q.answer_summary || "no answer"} <span className="text-muted">({q.score}/3)</span>
                        </li>
                      ))}
                    </ol>
                  </AiSurface>
                ) : null}
                <details className="mb-3 text-sm">
                  <summary className="cursor-pointer text-xs text-muted">Transcript ({r.transcript.length} turns)</summary>
                  <div className="mt-2 flex flex-col gap-1" dir="auto">
                    {r.transcript.map((turn, i) => (
                      <p key={i} className="rounded-control bg-surface-2 px-3 py-1 text-xs">
                        <span className="text-muted">{turn.role === "user" ? "Learner" : "Interviewer"}:</span> {turn.text}
                      </p>
                    ))}
                  </div>
                </details>
                <form action={markInterviewReviewedAction.bind(null, r.id)}>
                  <Button type="submit" variant="secondary">Mark reviewed</Button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
