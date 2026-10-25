import { and, eq, inArray, ne } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { courses, lessons as lessonTable } from "@/lib/db/schema";
import { Chip, Field, Input } from "@/components/ui";
import { WorkspaceSection } from "@/components/workspace-ui";
import { WorkspaceForm, SubmitButton } from "@/components/workspace-form";
import { QuestionForm } from "@/components/question-form";
import { AUTHORED_QUESTION_TYPES, type AuthoredQuestionType } from "@/lib/courses/question-input";
import {
  createBankAction,
  saveQuestionAction,
  removeQuestionAction,
  reviewDraftQuestionAction,
} from "@/app/(workspace)/admin/courses/bank-actions";
import type { QuestionBody } from "@/lib/db/schema";

const TYPE_LABEL: Record<string, string> = {
  ...Object.fromEntries(AUTHORED_QUESTION_TYPES),
  matching: "Matching",
  ordering: "Ordering",
  free_text: "Written answer",
};

function answerSummary(type: string, body: QuestionBody): string {
  if (type === "truefalse") return body.correct?.[0] === 0 ? "True" : "False";
  if (type === "fill_blank") return (body.acceptedAnswers ?? []).join(" / ");
  if (type === "mcq_single" || type === "mcq_multi")
    return (body.correct ?? []).map((i) => body.options?.[i]).filter(Boolean).join(", ");
  return "";
}

/** The course's own question banks: instructors create banks and write the questions quizzes draw from. */
export async function QuestionBanks({
  course,
  lessons,
  editable,
}: {
  course: typeof courses.$inferSelect;
  lessons: (typeof lessonTable.$inferSelect)[];
  editable: boolean;
}) {
  const banks = (
    await db.select().from(t.questionBanks).where(eq(t.questionBanks.courseId, course.id))
  ).sort((a, b) => a.name.localeCompare(b.name));
  const questions = banks.length
    ? await db
        .select()
        .from(t.questions)
        .where(and(inArray(t.questions.bankId, banks.map((b) => b.id)), ne(t.questions.status, "RETIRED")))
    : [];
  const quizLessons = lessons.filter((l) => l.type === "QUIZ" && l.payload.quizId);
  const quizzes = quizLessons.length
    ? await db.select().from(t.quizzes).where(inArray(t.quizzes.id, quizLessons.map((l) => l.payload.quizId!)))
    : [];
  const usage = (bankId: string) =>
    quizLessons.flatMap((lesson) => {
      const quiz = quizzes.find((q) => q.id === lesson.payload.quizId);
      const draws = (quiz?.sections ?? [])
        .filter((s) => s.bankId === bankId)
        .reduce((sum, s) => sum + (s.pickN ?? 0), 0);
      return draws ? [{ title: lesson.title, draws }] : [];
    });
  const revision = course.contentRevision;
  // Shared banks (such as AI drafts from a video) that this course's quizzes draw from.
  const sharedIds = [
    ...new Set(quizzes.flatMap((q) => q.sections.flatMap((s) => (s.bankId ? [s.bankId] : [])))),
  ].filter((bankId) => !banks.some((b) => b.id === bankId));
  const shared = sharedIds.length
    ? await db.select().from(t.questionBanks).where(inArray(t.questionBanks.id, sharedIds))
    : [];
  const sharedQuestions = shared.length
    ? await db
        .select()
        .from(t.questions)
        .where(and(inArray(t.questions.bankId, shared.map((b) => b.id)), ne(t.questions.status, "RETIRED")))
    : [];

  return (
    <div className="min-w-0 max-w-4xl space-y-6">
      <p className="text-sm text-muted">
        Write the questions your quizzes draw from. Questions you write here are ready to use straight away; the
        Department Head reviews them with the rest of the course. Choose a bank when you add a quiz lesson in
        Curriculum.
      </p>
      {banks.map((bank) => {
        const own = questions
          .filter((q) => q.bankId === bank.id)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const approved = own.filter((q) => q.status === "APPROVED").length;
        const used = usage(bank.id);
        const short = used.filter((u) => u.draws > approved);
        return (
          <WorkspaceSection
            key={bank.id}
            title={bank.name}
            description={`${approved} approved question${approved === 1 ? "" : "s"}${
              used.length ? ` · Used by ${used.map((u) => `“${u.title}” (draws ${u.draws})`).join(", ")}` : " · Not used by a quiz yet"
            }`}
          >
            {short.length ? (
              <p role="status" className="mb-4 rounded-control bg-warning-tint p-3 text-sm text-warning-fg">
                Add {Math.max(...short.map((u) => u.draws)) - approved} more question
                {Math.max(...short.map((u) => u.draws)) - approved === 1 ? "" : "s"} before submitting, or lower
                “Questions to draw” on the quiz.
              </p>
            ) : null}
            {own.length ? (
              <ol className="mb-4 flex flex-col gap-2">
                {own.map((q, index) => (
                  <li key={q.id} className="rounded-control border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">
                        {index + 1}. {q.body.prompt}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Chip variant="neutral">{TYPE_LABEL[q.type] ?? q.type}</Chip>
                        {q.status === "DRAFT" ? <Chip variant="warning">Awaiting HR review</Chip> : null}
                      </div>
                    </div>
                    {answerSummary(q.type, q.body) ? (
                      <p className="mt-1 text-muted">Answer: {answerSummary(q.type, q.body)}</p>
                    ) : null}
                    {editable && AUTHORED_QUESTION_TYPES.some(([key]) => key === q.type) ? (
                      <details className="mt-2">
                        <summary className="link cursor-pointer text-sm text-link">Edit question</summary>
                        <div className="mt-3">
                          <QuestionForm
                            action={saveQuestionAction.bind(null, course.id, bank.id, q.id)}
                            revision={revision}
                            initial={{ type: q.type as AuthoredQuestionType, body: q.body }}
                            submitLabel="Save question"
                          />
                        </div>
                      </details>
                    ) : null}
                    {editable ? (
                      <WorkspaceForm action={removeQuestionAction.bind(null, course.id, bank.id, q.id)} className="mt-2">
                        <input type="hidden" name="revision" value={revision} />
                        <SubmitButton variant="ghost">Remove</SubmitButton>
                      </WorkspaceForm>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mb-4 text-sm text-muted">No questions yet.</p>
            )}
            {editable ? (
              <details open={!own.length} className="rounded-control bg-surface-2 p-3">
                <summary className="cursor-pointer font-medium">Add a question</summary>
                <div className="mt-3">
                  <QuestionForm
                    action={saveQuestionAction.bind(null, course.id, bank.id, null)}
                    revision={revision}
                    submitLabel="Add question"
                  />
                </div>
              </details>
            ) : null}
          </WorkspaceSection>
        );
      })}
      {shared.map((bank) => {
        const list = sharedQuestions.filter((q) => q.bankId === bank.id);
        const approved = list.filter((q) => q.status === "APPROVED").length;
        const drafts = list.filter((q) => q.status === "DRAFT");
        return (
          <WorkspaceSection
            key={bank.id}
            title={bank.name}
            description={`Shared bank · ${approved} approved · ${drafts.length} AI draft${drafts.length === 1 ? "" : "s"} waiting · Used by ${usage(bank.id)
              .map((u) => `“${u.title}” (draws ${u.draws})`)
              .join(", ")}`}
          >
            {drafts.length ? (
              <ol className="flex flex-col gap-2">
                {drafts.map((q) => (
                  <li key={q.id} className="rounded-control border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{q.body.prompt}</p>
                      <Chip variant="ai">AI draft</Chip>
                    </div>
                    {q.body.options?.length ? (
                      <ul className="mt-2 list-disc pl-5 text-muted">
                        {q.body.options.map((option, i) => (
                          <li key={i} className={q.body.correct?.includes(i) ? "font-medium text-success-fg" : undefined}>
                            {option}
                            {q.body.correct?.includes(i) ? " (correct)" : ""}
                          </li>
                        ))}
                      </ul>
                    ) : answerSummary(q.type, q.body) ? (
                      <p className="mt-1 text-muted">Answer: {answerSummary(q.type, q.body)}</p>
                    ) : null}
                    {editable ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <WorkspaceForm action={reviewDraftQuestionAction.bind(null, course.id, q.id, "APPROVED")}>
                          <SubmitButton variant="secondary">Approve</SubmitButton>
                        </WorkspaceForm>
                        <WorkspaceForm action={reviewDraftQuestionAction.bind(null, course.id, q.id, "RETIRED")}>
                          <SubmitButton variant="ghost">Discard</SubmitButton>
                        </WorkspaceForm>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">No drafts waiting.</p>
            )}
          </WorkspaceSection>
        );
      })}
      {editable ? (
        <WorkspaceSection
          title="New question bank"
          description="Group questions by topic, for example “Fire safety exam”. One bank can feed one or more quizzes in this course."
        >
          <WorkspaceForm action={createBankAction.bind(null, course.id)} className="min-w-0">
            <input type="hidden" name="revision" value={revision} />
            <Field label="Bank name">
              <Input name="name" required maxLength={120} />
            </Field>
            <SubmitButton>Create question bank</SubmitButton>
          </WorkspaceForm>
        </WorkspaceSection>
      ) : !banks.length ? (
        <p className="text-sm text-muted">This course has no question banks of its own.</p>
      ) : null}
    </div>
  );
}
