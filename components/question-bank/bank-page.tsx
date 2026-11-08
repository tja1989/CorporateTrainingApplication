import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { Actor } from "@/lib/auth/roles";
import { questionBankPath } from "@/lib/navigation";
import { editBlockReason, isLiveCourse } from "@/lib/questions/rules";
import { questionUsage, referencingCourses, servedCount, type UsageRef } from "@/lib/questions/usage";
import type { QuestionType } from "@/lib/questions/validate";
import { createBankAction, createQuestionAction, editQuestionAction } from "@/lib/questions/actions";
import { draftToFormDefaults } from "@/lib/questions/validate";
import { QuestionEditor } from "./question-editor";
import { notFound } from "next/navigation";
import { QuestionGuide, questionTypeLabels } from "@/app/(workspace)/admin/reviews/question-guide";
import { ButtonLink, Card, Chip, EmptyState, Field, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { WorkspaceSection } from "@/components/workspace-ui";
import { SubmitButton, WorkspaceForm } from "@/components/workspace-form";

const PAGE_SIZE = 25;

export type BankSearchParams = {
  bank?: string; type?: string; mine?: string; q?: string; page?: string; question?: string;
};
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function authorLabel(q: { authorId: string | null; createdBy: string }, actor: Actor, names: Map<string, string>) {
  if (q.authorId === actor.id) return "You";
  if (q.authorId) return names.get(q.authorId) ?? "Former colleague";
  if (q.createdBy === "ai") return "AI";
  return "Starter content";
}

function UsedIn({ refs }: { refs: UsageRef[] }) {
  if (refs.length === 0) return <p className="text-sm text-muted">Not used in any quiz yet.</p>;
  return (
    <ul aria-label="Where this question is used" className="space-y-1 text-sm">
      {refs.map((ref, i) => (
        <li key={i} className="min-w-0 break-words">
          {ref.courseTitle} · {ref.quizTitle}
          <span className="text-muted"> ({ref.via === "picked" ? "picked" : "random draw"})</span>{" "}
          {ref.live && ref.exam ? <Chip variant="warning">Used in a live exam</Chip> : null}
        </li>
      ))}
    </ul>
  );
}

export async function BankPage({ actor, searchParams }: { actor: Actor; searchParams: BankSearchParams }) {
  const base = questionBankPath(actor.role);
  const bankFilter = searchParams.bank ?? "";
  const typeFilter = searchParams.type ?? "";
  const mine = searchParams.mine === "1";
  const search = (searchParams.q ?? "").trim();
  const page = Math.max(1, Math.floor(Number(searchParams.page)) || 1);
  const selectedId = searchParams.question ?? "";

  const banks = await db.select().from(t.questionBanks).orderBy(asc(t.questionBanks.name));
  const bankName = new Map(banks.map((b) => [b.id, b.name]));

  const filters: SQL[] = [eq(t.questions.status, "APPROVED")];
  if (bankFilter) filters.push(eq(t.questions.bankId, bankFilter));
  if (typeFilter in questionTypeLabels) filters.push(eq(t.questions.type, typeFilter as QuestionType));
  if (mine) filters.push(eq(t.questions.authorId, actor.id));
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    filters.push(sql`(${t.questions.body}->>'prompt' ILIKE ${pattern} OR ${t.questions.body}->>'stimulus' ILIKE ${pattern})`);
  }
  const where = and(...filters);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(t.questions).where(where);
  const rows = await db.select().from(t.questions).where(where)
    .orderBy(desc(t.questions.createdAt), asc(t.questions.id))
    .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  const [selected] = selectedId
    ? await db.select().from(t.questions).where(and(eq(t.questions.id, selectedId), eq(t.questions.status, "APPROVED"))).limit(1)
    : [];

  const authorIds = [...new Set([...rows, ...(selected ? [selected] : [])].map((r) => r.authorId).filter((x): x is string => !!x && x !== actor.id))];
  const people = authorIds.length ? await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(inArray(t.users.id, authorIds)) : [];
  const names = new Map(people.map((p) => [p.id, p.name]));
  const usage = await questionUsage([...rows.map((r) => r.id), ...(selected ? [selected.id] : [])]);

  let blocked: string | null = null;
  if (selected) {
    const courses = await referencingCourses(selected);
    blocked = editBlockReason({
      actor,
      authorId: selected.authorId,
      servedCount: await servedCount(selected.id),
      liveCourseTitles: courses.filter(isLiveCourse).map((c) => c.title),
    });
  }

  const link = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const all = { bank: bankFilter, type: typeFilter, mine: mine ? "1" : "", q: search, ...extra };
    for (const [k, v] of Object.entries(all)) if (v !== "" && v !== undefined) params.set(k, String(v));
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-w-0">
      <PageHeader
        title="Question bank"
        sub="Questions shared by every course. Add your own, then pick them or draw from them in a quiz."
        actions={<ButtonLink href={`${base}/new`}>New question</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <WorkspaceSection title="Find questions">
          <form method="get" action={base} className="min-w-0">
            <Field label="Search"><Input name="q" type="search" defaultValue={search} /></Field>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Bank">
                <Select name="bank" defaultValue={bankFilter}>
                  <option value="">All banks</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Question type">
                <Select name="type" defaultValue={typeFilter}>
                  <option value="">All types</option>
                  {Object.entries(questionTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
            </div>
            <label className="touch-target mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-5" />
              Only my questions
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClass("primary")}>Apply filters</button>
              <ButtonLink href={base} variant="secondary">Clear</ButtonLink>
            </div>
          </form>
        </WorkspaceSection>

        <WorkspaceSection title="New bank" description="A bank groups related questions, such as one topic.">
          <details>
            <summary className="touch-target flex cursor-pointer items-center font-medium text-link">Add a bank</summary>
            <WorkspaceForm action={createBankAction} className="mt-3 min-w-0" success="Bank created.">
              <Field label="Bank name"><Input name="name" required /></Field>
              <Field label="Tags (optional)" hint="Separate tags with commas."><Input name="tags" /></Field>
              <SubmitButton>Create bank</SubmitButton>
            </WorkspaceForm>
          </details>
        </WorkspaceSection>
      </div>

      {selected ? (
        <section aria-label="Selected question" className="mb-6 min-w-0 rounded-card border border-border bg-surface p-4 sm:p-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Chip>{questionTypeLabels[selected.type] ?? selected.type}</Chip>
            <Chip>{selected.points} {selected.points === 1 ? "point" : "points"}</Chip>
            <span className="min-w-0 break-words text-sm text-muted">{bankName.get(selected.bankId) ?? "Bank"} · {authorLabel(selected, actor, names)}</span>
          </div>
          <h2 className="break-words text-lg font-semibold">{selected.body.prompt}</h2>
          <QuestionGuide type={selected.type} body={selected.body} rubric={selected.rubric} />
          <h3 className="mb-1 font-semibold">Used in</h3>
          <UsedIn refs={usage.get(selected.id) ?? []} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {blocked ? (
              <>
                <p className="min-w-0 break-words text-sm text-muted">{blocked}</p>
                <ButtonLink href={`${base}/new?from=${selected.id}`}>Copy and edit</ButtonLink>
              </>
            ) : (
              <>
                <ButtonLink href={`${base}/${selected.id}/edit`}>Edit</ButtonLink>
                <ButtonLink href={`${base}/new?from=${selected.id}`} variant="secondary">Copy and edit</ButtonLink>
              </>
            )}
            <ButtonLink href={link({})} variant="ghost">Close</ButtonLink>
          </div>
        </section>
      ) : null}

      <section aria-label="Questions" className="min-w-0">
        <h2 className="eyebrow mb-2 text-muted">{total} {total === 1 ? "question" : "questions"}</h2>
        {rows.length === 0 ? (
          <EmptyState title="No questions found" body="Try other filters, or add a question." action={<ButtonLink href={`${base}/new`}>New question</ButtonLink>} />
        ) : (
          <ul className="space-y-3">
            {rows.map((q) => (
              <li key={q.id}>
                <Card className="min-w-0 p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Chip>{questionTypeLabels[q.type] ?? q.type}</Chip>
                    <span className="text-sm text-muted">{q.points} {q.points === 1 ? "point" : "points"}</span>
                    <span className="min-w-0 break-words text-sm text-muted">· {bankName.get(q.bankId) ?? "Bank"} · {authorLabel(q, actor, names)}</span>
                  </div>
                  <a href={link({ question: q.id, page: page > 1 ? page : undefined })} aria-current={q.id === selected?.id ? "true" : undefined} className="block break-words font-medium text-link">{q.body.prompt}</a>
                  <div className="mt-2"><UsedIn refs={usage.get(q.id) ?? []} /></div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center gap-3">
            {page > 1 ? <ButtonLink href={link({ page: page - 1 })} variant="secondary">Previous</ButtonLink> : null}
            <span className="text-sm text-muted">Page {page} of {pages}</span>
            {page < pages ? <ButtonLink href={link({ page: page + 1 })} variant="secondary">Next</ButtonLink> : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

const approved = async (questionId: string) => {
  const [question] = questionId
    ? await db.select().from(t.questions).where(and(eq(t.questions.id, questionId), eq(t.questions.status, "APPROVED"))).limit(1)
    : [];
  return question;
};
const draftOf = (q: typeof t.questions.$inferSelect) => ({ type: q.type, points: q.points, body: q.body, rubric: q.rubric });

export async function NewQuestionPage({ actor, from }: { actor: Actor; from?: string }) {
  const base = questionBankPath(actor.role);
  const banks = await db.select({ id: t.questionBanks.id, name: t.questionBanks.name }).from(t.questionBanks).orderBy(asc(t.questionBanks.name));
  const source = await approved(from ?? "");
  return (
    <div className="min-w-0">
      <PageHeader
        title={source ? "Copy and edit question" : "New question"}
        sub={source ? "This makes a new question. The original stays as it is." : "Add a question to a bank."}
        actions={<ButtonLink href={base} variant="secondary">Back to question bank</ButtonLink>}
      />
      <Card className="min-w-0 p-4 sm:p-6">
        {banks.length === 0 ? <p className="mb-4 text-sm text-muted">There are no banks yet. Go back and add a bank first.</p> : null}
        <QuestionEditor
          action={createQuestionAction}
          banks={banks}
          defaults={source ? draftToFormDefaults(draftOf(source)) : undefined}
          defaultBankId={source?.bankId}
          submitLabel="Add question"
        />
      </Card>
    </div>
  );
}

export async function EditQuestionPage({ actor, questionId }: { actor: Actor; questionId: string }) {
  const base = questionBankPath(actor.role);
  const question = await approved(questionId);
  if (!question) notFound();
  const banks = await db.select({ id: t.questionBanks.id, name: t.questionBanks.name }).from(t.questionBanks);
  const courses = await referencingCourses(question);
  const blocked = editBlockReason({
    actor,
    authorId: question.authorId,
    servedCount: await servedCount(question.id),
    liveCourseTitles: courses.filter(isLiveCourse).map((c) => c.title),
  });
  return (
    <div className="min-w-0">
      <PageHeader
        title="Edit question"
        actions={<ButtonLink href={`${base}?question=${question.id}`} variant="secondary">Back to question</ButtonLink>}
      />
      <Card className="min-w-0 p-4 sm:p-6">
        {blocked ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="min-w-0 break-words">{blocked}</p>
            <ButtonLink href={`${base}/new?from=${question.id}`}>Copy and edit</ButtonLink>
          </div>
        ) : (
          <QuestionEditor
            action={editQuestionAction.bind(null, question.id)}
            banks={banks}
            defaults={draftToFormDefaults(draftOf(question))}
            defaultBankId={question.bankId}
            lockBank
          />
        )}
      </Card>
    </div>
  );
}
