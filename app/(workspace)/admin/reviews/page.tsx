import { WorkspaceTabs } from "@/components/workspace-ui";
import { WorkspaceForm, SubmitButton } from "@/components/workspace-form";
import { QuestionGuide, questionTypeLabels } from "./question-guide";
import { asc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { AiSurface, Button, Card, Chip, PageTitle, EmptyState, Input, Field } from "@/components/ui";
import { approveDraftAction, discardDraftAction, confirmGradeAction, adjustGradeAction, markInterviewReviewedAction, overturnInterviewAction } from "./actions";
import { pendingInterviewReviews } from "@/lib/live/store";

export const dynamic = "force-dynamic";

/** Review queues (spec §11.13): AI question drafts + AI grading confirmations. */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ view?: string; item?: string }> }) {
  const { view: v, item } = await searchParams;
  const view = v === "drafts" || v === "oral" ? v : "grades";
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
  const selectedGrade = pendingGrades.some(r => r.id === item) ? item : pendingGrades[0]?.id;
  const selectedDraft = drafts.some(r => r.id === item) ? item : drafts[0]?.id;
  const selectedOral = oralReviews.some(r => r.id === item) ? item : oralReviews[0]?.id;

  return (
    <div className="animate-slide-up">
      <PageTitle sub="Human judgement gates: AI-graded answers and AI-drafted questions.">Review queues</PageTitle>

      <WorkspaceTabs label="Review queue" items={[{ href: "/admin/reviews?view=grades", label: `Grades (${pendingGrades.length})`, active: view === "grades" }, { href: "/admin/reviews?view=drafts", label: `Question drafts (${drafts.length})`, active: view === "drafts" }, { href: "/admin/reviews?view=oral", label: `Oral checks (${oralReviews.length})`, active: view === "oral" }]} />
      {view === "grades" ? <section className="mb-8" aria-label="Grading reviews">
        <h2 className="eyebrow mb-2 text-muted">AI-graded answers awaiting confirmation ({pendingGrades.length})</h2>
        {pendingGrades.length === 0 ? (
          <EmptyState title="Nothing pending" body="Free-text answers that AI fails, grades with low confidence, or that learners appeal land here." />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><nav id="pending-grades" aria-label="Pending grades" className="order-2 flex flex-col gap-2 xl:order-1">{pendingGrades.map(r => <a key={r.id} href={`/admin/reviews?view=grades&item=${r.id}`} aria-current={selectedGrade === r.id ? "page" : undefined} className="rounded-input border border-border bg-surface p-4 hover:bg-surface-2 aria-[current]:border-primary"><span className="block font-medium text-link">{nameOf.get(attemptOf.get(r.attemptId)?.userId ?? "") ?? "Employee"}</span><span className="mt-1 block text-sm text-muted">{questionOf.get(r.questionId)?.body.prompt}</span><span className="mt-2 block text-sm">{r.reason.replaceAll("_", " ")}</span></a>)}</nav><div className="order-1 min-w-0 xl:order-2">
            {pendingGrades.filter(r => r.id === selectedGrade).map((review) => {
              const attempt = attemptOf.get(review.attemptId);
              const q = questionOf.get(review.questionId);
              const answers = (attempt?.answers ?? {}) as Record<string, { kind: string; text?: string }>;
              const answerText = answers[review.questionId]?.text ?? "(no answer)";
              const aiTotal = (review.aiScores ?? []).reduce((s, c) => s + c.points, 0);
              const aiMax = (review.aiScores ?? []).reduce((s, c) => s + c.max, 0);
              return (
                <Card key={review.id} className="p-4 text-sm"><a href="#pending-grades" className="link mb-3 inline-flex touch-target xl:hidden">Choose another grading review ↓</a>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{nameOf.get(attempt?.userId ?? "") ?? "—"}</span>
                    <Chip variant={review.reason === "ai_fail" ? "destructive" : review.reason === "appeal" ? "warning" : "neutral"}>
                      {review.reason.replace("_", " ")}
                    </Chip>
                    <Chip variant="ai">AI: {aiTotal}/{aiMax} · conf {Math.round((review.aiConfidence ?? 0) * 100)}%</Chip>
                  </div>
                  <p className="mb-1 text-muted">{q?.body.prompt}</p>
                  {q?.body.stimulus ? (
                    <section aria-label="Question scenario" className="mb-3">
                      <h3 className="mb-1 font-semibold">Scenario</h3>
                      <p className="whitespace-pre-wrap break-words">{q.body.stimulus}</p>
                    </section>
                  ) : null}
                  <blockquote className="mb-2 rounded-control bg-surface-2 p-2 whitespace-pre-wrap">{answerText}</blockquote>
                  {q?.rubric ? <details className="mb-3"><summary className="touch-target flex items-center font-medium text-link">Marking rubric and model answer</summary><ul className="my-2 list-disc ps-5">{q.rubric.criteria.map(c => <li key={c.name}>{c.name} · {c.points} points</li>)}</ul><p className="whitespace-pre-wrap break-words text-muted">{q.rubric.modelAnswer}</p></details> : null}
                  {review.aiScores?.length ? <ul aria-label="AI criterion scores" className="mb-3 text-sm">{review.aiScores.map(c => <li key={c.criterion} className="flex flex-wrap justify-between gap-2 border-b border-border py-2"><span>{c.criterion}</span><span>{c.points}/{c.max}</span></li>)}</ul> : null}
                  {review.aiRationale ? <AiSurface variant="block" className="mb-2" label="AI rationale">{review.aiRationale}</AiSurface> : null}
                  <div className="flex flex-wrap items-end gap-2">
                    <WorkspaceForm action={confirmGradeAction.bind(null, review.id)}>
                      <SubmitButton variant="secondary">Confirm AI grade</SubmitButton>
                    </WorkspaceForm>
                    <WorkspaceForm action={adjustGradeAction.bind(null, review.id)}><div className="flex flex-wrap items-end gap-2">
                      <Field label={`Adjusted points (of ${aiMax})`}><Input name="points" type="number" min={0} max={aiMax} step={0.5} defaultValue={aiTotal} required /></Field>
                      <Button type="submit" className="mb-4">Adjust & finalize</Button>
                    </div></WorkspaceForm>
                  </div>
                </Card>
              );
            })}
          </div></div>
        )}
      </section> : null}

      {view === "drafts" ? <section aria-label="AI question drafts">
        <h2 className="eyebrow mb-2 text-muted">AI-drafted questions ({drafts.length}) — never published without approval</h2>
        {drafts.length === 0 ? (
          <EmptyState title="No drafts" body="Questions generated from ingested videos appear here for approval." />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><nav id="question-drafts" aria-label="Question drafts" className="order-2 flex flex-col gap-2 xl:order-1">{drafts.map(d => <a key={d.id} href={`/admin/reviews?view=drafts&item=${d.id}`} aria-current={selectedDraft === d.id ? "page" : undefined} className="rounded-input border border-border bg-surface p-4 hover:bg-surface-2 aria-[current]:border-primary"><span className="block text-sm text-muted">{questionTypeLabels[d.type]}</span><span className="mt-1 block font-medium text-link">{d.body.prompt}</span></a>)}</nav><div className="order-1 min-w-0 xl:order-2">
            {drafts.filter(d => d.id === selectedDraft).map((d) => (
              <Card key={d.id} className="p-4 text-sm"><a href="#question-drafts" className="link mb-3 inline-flex touch-target xl:hidden">Choose another question ↓</a>
                <div className="mb-1 flex items-center gap-2">
                  <Chip variant="ai">AI draft · {questionTypeLabels[d.type]}</Chip>
                  {d.source?.startSec !== undefined ? <span className="text-xs text-muted">from video @ {d.source?.startSec}s</span> : null}
                </div>
                <p className="mb-1 font-medium">{d.body.prompt}</p>
                <QuestionGuide type={d.type} body={d.body} rubric={d.rubric} />
                <div className="flex gap-2">
                  <WorkspaceForm action={approveDraftAction.bind(null, d.id)}>
                    <SubmitButton variant="secondary">Approve</SubmitButton>
                  </WorkspaceForm>
                  <WorkspaceForm action={discardDraftAction.bind(null, d.id)}>
                    <SubmitButton variant="ghost">Discard</SubmitButton>
                  </WorkspaceForm>
                </div>
              </Card>
            ))}
          </div></div>
        )}
      </section> : null}

      {view === "oral" ? <section aria-label="Oral check reviews">
        <h2 className="eyebrow mb-2 text-muted">Oral checks not passed ({oralReviews.length})</h2>
        {oralReviews.length === 0 ? (
          <EmptyState icon="mic" tone="ai" title="No failed oral checks waiting" body="Checks under the pass mark land here for a human look — confirm the fail, or overturn it to a pass." />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><nav id="pending-oral-checks" aria-label="Pending oral checks" className="order-2 flex flex-col gap-2 xl:order-1">{oralReviews.map(r => <a key={r.id} href={`/admin/reviews?view=oral&item=${r.id}`} aria-current={selectedOral === r.id ? "page" : undefined} className="rounded-input border border-border bg-surface p-4 hover:bg-surface-2 aria-[current]:border-primary"><span className="block font-medium text-link">{r.learnerName}</span><span className="mt-1 block text-sm text-muted">{r.lessonTitle} · {r.scorePct ?? 0}%</span></a>)}</nav><div className="order-1 min-w-0 xl:order-2">
            {oralReviews.filter(r => r.id === selectedOral).map((r) => (
              <Card key={r.id} className="p-4"><a href="#pending-oral-checks" className="link mb-3 inline-flex touch-target xl:hidden">Choose another oral check ↓</a>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.learnerName}</span>
                  <span className="flex gap-2">
                    <Chip variant="warning">{r.scorePct ?? 0}% · not passed (pass mark {r.passPct}%)</Chip>
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
                <div className="flex flex-wrap gap-2">
                  <WorkspaceForm action={markInterviewReviewedAction.bind(null, r.id)}>
                    <SubmitButton variant="secondary">Confirm fail</SubmitButton>
                  </WorkspaceForm>
                  <WorkspaceForm action={overturnInterviewAction.bind(null, r.id)}>
                    <SubmitButton>Overturn to pass</SubmitButton>
                  </WorkspaceForm>
                </div>
              </Card>
            ))}
          </div></div>
        )}
      </section> : null}
    </div>
  );
}
