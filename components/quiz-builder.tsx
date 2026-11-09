"use client";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { Button, Chip, Field, Icon, Input, Select } from "@/components/ui";
import { WorkspaceForm } from "@/components/workspace-form";
import { Dialog } from "@/components/dialog";
import { QuestionFieldsEditor } from "@/components/question-bank/question-editor";
import { questionTypeLabels } from "@/app/(workspace)/admin/reviews/question-guide";
import { addLessonAction } from "@/app/(workspace)/admin/courses/actions";
import {
  copyQuizContentAction,
  createQuestionInlineAction,
  saveQuizAction,
  searchQuestionsAction,
} from "@/lib/quiz/composition-actions";
import type { PickerQuestion, QuizContent } from "@/lib/quiz/composition";
import { saveConfirmingLiveExam } from "@/lib/quiz/live-exam";
import { plural } from "@/lib/format";

/** `liveExam`: the bank holds an approved question a live exam uses. */
export type QuizBank = { id: string; name: string; approvedCount: number; liveExam: boolean };
type DrawRow = { key: number; bankId: string; count: string };

const LIVE_EXAM_CONFIRM = "Learners will see these answers right after submitting.";
const panel = "mt-6 min-w-0 border-t border-border pt-4";

/** Type, bank, points and live-exam badge under a question's prompt. */
function QuestionSummary({ question }: { question: PickerQuestion }) {
  return (
    // 12rem before growing, so on a phone the row's buttons wrap below rather than squeeze the prompt.
    <div className="min-w-0 grow basis-[12rem]">
      <p className="break-words font-medium">{question.prompt}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Chip>{questionTypeLabels[question.type] ?? question.type}</Chip>
        <span className="min-w-0 break-words">
          {question.bankName} · {plural(question.points, "point")}
        </span>
        {question.liveExam ? <Chip variant="warning">Used in a live exam</Chip> : null}
      </div>
    </div>
  );
}

/** Searches APPROVED questions across every bank. Its controls carry no
 * names, so they never post with the quiz. */
function BankSearch({
  banks,
  pickedIds,
  onAdd,
}: {
  banks: QuizBank[];
  pickedIds: Set<string>;
  onAdd: (question: PickerQuestion) => void;
}) {
  const [filter, setFilter] = useState({ q: "", bank: "", type: "", mine: false });
  const [searched, setSearched] = useState(filter);
  const [results, setResults] = useState<PickerQuestion[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (nextPage: number) => {
    const used = nextPage === 1 ? filter : searched;
    setBusy(true);
    setError("");
    try {
      const found = await searchQuestionsAction({ ...used, page: nextPage });
      setResults((current) => (nextPage === 1 ? found.rows : [...(current ?? []), ...found.rows]));
      setSearched(used);
      setPage(nextPage);
      setMore(found.more);
    } catch {
      setError("Could not search the bank. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Add from the bank" className={panel}>
      <h3 className="mb-1 font-semibold">Add from the bank</h3>
      <p className="mb-3 text-sm text-muted">Find approved questions from every bank.</p>
      <Field label="Search questions">
        <Input
          type="search"
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          onKeyDown={(e) => {
            // Enter searches instead of saving the quiz.
            if (e.key !== "Enter") return;
            e.preventDefault();
            void run(1);
          }}
        />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Bank">
          <Select value={filter.bank} onChange={(e) => setFilter({ ...filter, bank: e.target.value })}>
            <option value="">All banks</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Question type">
          <Select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
            <option value="">All types</option>
            {Object.entries(questionTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="touch-target mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={filter.mine}
          onChange={(e) => setFilter({ ...filter, mine: e.target.checked })}
          className="size-5"
        />
        Only my questions
      </label>
      <Button type="button" variant="secondary" onClick={() => void run(1)} disabled={busy}>
        {busy ? "Searching…" : "Search"}
      </Button>
      <div aria-live="polite">
        {error ? <p role="alert" className="mt-3 text-sm text-destructive-text">{error}</p> : null}
        {results?.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No approved questions match.</p>
        ) : null}
      </div>
      {results?.length ? (
        <ul aria-label="Search results" className="mt-3 divide-y divide-border">
          {results.map((q) => {
            const added = pickedIds.has(q.id);
            return (
              <li key={q.id} className="flex min-w-0 flex-wrap items-start gap-2 py-3 sm:flex-nowrap">
                <QuestionSummary question={q} />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={added}
                  onClick={() => onAdd(q)}
                  aria-label={`${added ? "Added" : "Add"}: ${q.prompt}`}
                  className="shrink-0"
                >
                  {added ? "Added" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {more ? (
        <Button type="button" variant="ghost" onClick={() => void run(page + 1)} disabled={busy}>
          Show more
        </Button>
      ) : null}
    </section>
  );
}

/** QuestionFieldsEditor in its own form, so the new question comes back
 * without reloading the page and losing the quiz in progress. */
function WriteQuestionDialog({
  open,
  onClose,
  banks,
  courseId,
  onCreated,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  banks: QuizBank[];
  courseId: string;
  onCreated: (question: PickerQuestion, revision?: number) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const close = () => {
    setError("");
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title="Write a new question" returnFocusRef={returnFocusRef}>
      {open ? (
        <form
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            if (saving) return;
            const data = new FormData(event.currentTarget);
            setSaving(true);
            setError("");
            void (async () => {
              try {
                const result = await createQuestionInlineAction(data);
                if (result.question) {
                  onCreated(result.question, result.revision);
                  close();
                } else setError(result.error ?? "Could not save the question. Try again.");
              } catch {
                setError("Could not save the question. Your entries are still here; try again.");
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          <input type="hidden" name="courseId" value={courseId} />
          <p className="mb-4 text-sm text-muted">
            It is saved to the bank you choose, so other quizzes can reuse it, and added to this quiz.
          </p>
          <fieldset disabled={saving} className="min-w-0">
            <QuestionFieldsEditor banks={banks} />
          </fieldset>
          {error ? (
            <p role="alert" className="mb-4 whitespace-pre-line rounded-input bg-destructive-tint p-3 text-sm text-destructive-text">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save and add"}</Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}

/** Builds a quiz from picked, newly written and randomly drawn questions.
 * "new" adds a quiz lesson to a module; "edit" saves an existing quiz. */
export function QuizBuilder({
  mode,
  courseId,
  lessonId,
  moduleId,
  initial,
  banks,
  copySources,
  revision: loadedRevision,
}: {
  mode: "new" | "edit";
  courseId: string;
  lessonId?: string;
  moduleId?: string;
  initial: {
    title: string;
    content: QuizContent;
    questions: PickerQuestion[];
    exam: boolean;
    integrity: boolean;
    passPct: number;
    attemptsLimit: number | null;
    timeLimitSec: number | null;
  };
  banks: QuizBank[];
  copySources: { lessonId: string; label: string }[];
  revision: number;
}) {
  const nextKey = useRef(0);
  const drawRow = (bankId = "", count = ""): DrawRow => ({ key: nextKey.current++, bankId, count });
  const [picked, setPicked] = useState<PickerQuestion[]>(() =>
    initial.content.picked.flatMap((id) => initial.questions.find((q) => q.id === id) ?? []),
  );
  const [draws, setDraws] = useState<DrawRow[]>(() =>
    initial.content.draws.map((d) => drawRow(d.bankId, String(d.pickN))),
  );
  const [exam, setExam] = useState(initial.exam);
  const [revision, setRevision] = useState(loadedRevision);
  const [approved, setApproved] = useState(() => new Map(banks.map((b) => [b.id, b.approvedCount])));
  const [writing, setWriting] = useState(false);
  const [source, setSource] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyNote, setCopyNote] = useState("");
  const writeButton = useRef<HTMLButtonElement>(null);
  const confirmField = useRef<HTMLInputElement>(null);
  const pickedIds = new Set(picked.map((q) => q.id));
  const liveBanks = new Set(banks.filter((b) => b.liveExam).map((b) => b.id));
  const sources = copySources.filter((s) => s.lessonId !== lessonId);
  const action =
    mode === "new"
      ? addLessonAction.bind(null, courseId, moduleId ?? "")
      : saveQuizAction.bind(null, courseId, lessonId ?? "");
  // A page loaded before a live exam started using these questions learns it
  // from the save; ask then, and save again on OK.
  const save = (data: FormData) =>
    saveConfirmingLiveExam(action, data, () => window.confirm(LIVE_EXAM_CONFIRM));

  const add = (questions: PickerQuestion[]) =>
    setPicked((current) => {
      const have = new Set(current.map((q) => q.id));
      return [...current, ...questions.filter((q) => !have.has(q.id))];
    });
  const move = (index: number, by: -1 | 1) =>
    setPicked((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  const patchDraw = (key: number, change: Partial<DrawRow>) =>
    setDraws((current) => current.map((d) => (d.key === key ? { ...d, ...change } : d)));

  const created = (question: PickerQuestion, newRevision?: number) => {
    add([question]);
    if (newRevision !== undefined) setRevision(newRevision);
    setApproved((current) => new Map(current).set(question.bankId, (current.get(question.bankId) ?? 0) + 1));
  };

  const copy = async () => {
    setCopying(true);
    setCopyNote("");
    try {
      const result = await copyQuizContentAction(source);
      if (!result.content || !result.questions) {
        setCopyNote(result.error ?? "This quiz is not available to copy.");
        return;
      }
      const newQuestions = result.questions.filter((q) => !pickedIds.has(q.id));
      const banksDrawn = new Set(draws.map((d) => d.bankId));
      const newDraws: DrawRow[] = [];
      for (const d of result.content.draws) {
        if (banksDrawn.has(d.bankId)) continue;
        banksDrawn.add(d.bankId);
        newDraws.push(drawRow(d.bankId, String(d.pickN)));
      }
      add(newQuestions);
      setDraws((current) => [...current, ...newDraws]);
      const skipped = result.questions.length - newQuestions.length + result.content.draws.length - newDraws.length;
      setCopyNote(
        `Added ${plural(newQuestions.length, "question")} and ${plural(newDraws.length, "random draw")}` +
          (skipped ? `; skipped ${skipped} already in this quiz.` : "."),
      );
    } catch {
      setCopyNote("Could not copy that quiz. Try again.");
    } finally {
      setCopying(false);
    }
  };

  /** A practice quiz shows answers right after submitting, so picking a
   * question a live exam uses, or drawing from a bank holding one, needs
   * the author's say-so. */
  const confirmLiveExam = (event: FormEvent) => {
    const field = confirmField.current;
    if (!field) return;
    field.value = "";
    if (exam || !(picked.some((q) => q.liveExam) || draws.some((d) => liveBanks.has(d.bankId)))) return;
    if (window.confirm(LIVE_EXAM_CONFIRM)) field.value = "on";
    else {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div className="min-w-0">
      <div onSubmitCapture={confirmLiveExam} className="min-w-0">
        <WorkspaceForm action={save} className="min-w-0">
          {mode === "new" ? <input type="hidden" name="type" value="QUIZ" /> : null}
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="confirmLiveExam" defaultValue="" ref={confirmField} />
          <Field label={mode === "new" ? "Lesson title" : "Quiz title"}>
            <Input name="title" defaultValue={initial.title} required />
          </Field>

          <section aria-label="Picked questions" className="min-w-0">
            <h3 className="mb-1 font-semibold">Picked questions</h3>
            <p className="mb-2 text-sm text-muted">Every learner gets these questions.</p>
            {picked.length ? (
              <ol className="mb-3 divide-y divide-border">
                {picked.map((q, i) => (
                  <li key={q.id} className="flex min-w-0 flex-wrap items-start gap-2 py-3 sm:flex-nowrap">
                    <input type="hidden" name="picked" value={q.id} />
                    <span aria-hidden className="w-6 shrink-0 text-sm text-muted">{i + 1}.</span>
                    <QuestionSummary question={q} />
                    <div className="ms-auto flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" className="px-2" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                        <Icon name="arrow-up" size={16} />
                      </Button>
                      <Button type="button" variant="ghost" className="px-2" aria-label={`Move question ${i + 1} down`} disabled={i === picked.length - 1} onClick={() => move(i, 1)}>
                        <Icon name="arrow-down" size={16} />
                      </Button>
                      <Button type="button" variant="ghost" aria-label={`Remove question ${i + 1}`} onClick={() => setPicked((current) => current.filter((x) => x.id !== q.id))}>
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mb-3 text-sm text-muted">No questions picked yet.</p>
            )}
            <Button ref={writeButton} type="button" variant="secondary" onClick={() => setWriting(true)}>
              Write a new question
            </Button>
          </section>

          <BankSearch banks={banks} pickedIds={pickedIds} onAdd={(q) => add([q])} />

          <section aria-label="Random draws" className={panel}>
            <h3 className="mb-1 font-semibold">Random draws</h3>
            <p className="mb-3 text-sm text-muted">Each learner gets a different random set of approved questions from the bank.</p>
            {draws.map((d, i) => {
              const count = Number(d.count);
              const have = approved.get(d.bankId);
              const over = have !== undefined && Number.isInteger(count) && count > have;
              return (
                <fieldset key={d.key} className="mb-3 min-w-0 rounded-control border border-border p-3">
                  <legend className="px-1 text-sm font-medium">Random draw {i + 1}</legend>
                  <div className="grid gap-x-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                    <Field label="Question bank">
                      <Select name="drawBank" value={d.bankId} onChange={(e) => patchDraw(d.key, { bankId: e.target.value })} required>
                        <option value="">Choose a bank</option>
                        {banks.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Questions to draw">
                      <Input name="drawCount" type="number" min={1} max={100} inputMode="numeric" value={d.count} onChange={(e) => patchDraw(d.key, { count: e.target.value })} required />
                    </Field>
                  </div>
                  {liveBanks.has(d.bankId) ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Chip variant="warning">Used in a live exam</Chip>
                    </div>
                  ) : null}
                  {over ? (
                    <p className="mb-3 flex items-start gap-2 rounded-control bg-warning-tint p-3 text-sm text-warning-fg">
                      <Icon name="warning" size={16} className="mt-1 shrink-0" />
                      {`Only ${have} approved questions in this bank. Lower the number or add questions before submitting for approval.`}
                    </p>
                  ) : null}
                  <Button type="button" variant="ghost" aria-label={`Remove random draw ${i + 1}`} onClick={() => setDraws((current) => current.filter((x) => x.key !== d.key))}>
                    Remove
                  </Button>
                </fieldset>
              );
            })}
            <Button type="button" variant="secondary" onClick={() => setDraws((current) => [...current, drawRow()])}>
              Add a random draw
            </Button>
          </section>

          {sources.length ? (
            <section aria-label="Copy from another quiz" className={panel}>
              <h3 className="mb-1 font-semibold">Copy from another quiz</h3>
              <p className="mb-3 text-sm text-muted">Adds its approved questions and random draws. Anything already in this quiz is skipped.</p>
              <div className="flex min-w-0 flex-wrap items-end gap-x-3">
                <div className="min-w-0 flex-1 basis-[15rem]">
                  <Field label="Quiz to copy from">
                    <Select value={source} onChange={(e) => setSource(e.target.value)}>
                      <option value="">Choose a quiz</option>
                      {sources.map((s) => (
                        <option key={s.lessonId} value={s.lessonId}>{s.label}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button type="button" variant="secondary" className="mb-4" disabled={!source || copying} onClick={() => void copy()}>
                  {copying ? "Copying…" : "Copy questions"}
                </Button>
              </div>
              <p role="status" className="text-sm text-muted">{copyNote}</p>
            </section>
          ) : null}

          <div className={panel}>
            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
              <Field label="Pass mark %">
                <Input name="passPct" type="number" min={1} max={100} defaultValue={initial.passPct} required />
              </Field>
              <Field label="Attempts allowed (blank = unlimited)">
                <Input name="attemptsLimit" type="number" min={1} max={20} defaultValue={initial.attemptsLimit ?? ""} />
              </Field>
              <Field label="Time limit in minutes (blank = none)">
                <Input
                  name="timeLimitMinutes"
                  type="number"
                  min={1}
                  max={180}
                  defaultValue={initial.timeLimitSec ? Math.round(initial.timeLimitSec / 60) : ""}
                />
              </Field>
            </div>
            <label className="touch-target flex items-center gap-3 text-sm">
              <input type="checkbox" name="exam" checked={exam} onChange={(e) => setExam(e.target.checked)} className="size-5" />
              Exam mode (feedback after submission)
            </label>
            <label className="touch-target mb-4 flex items-center gap-3 text-sm">
              <input type="checkbox" name="integrity" defaultChecked={initial.integrity} className="size-5" />
              Integrity monitoring
            </label>
          </div>
          <Button type="submit">{mode === "new" ? "Add lesson" : "Save quiz"}</Button>
        </WorkspaceForm>
      </div>
      <WriteQuestionDialog
        open={writing}
        onClose={() => setWriting(false)}
        banks={banks}
        courseId={courseId}
        onCreated={created}
        returnFocusRef={writeButton}
      />
    </div>
  );
}
