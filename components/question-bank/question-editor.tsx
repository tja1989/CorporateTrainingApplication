"use client";
import { useRef, useState, type ReactNode } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton, WorkspaceForm, type ActionResult } from "@/components/workspace-form";
import { questionTypeLabels } from "@/app/(workspace)/admin/reviews/question-guide";

type Defaults = Record<string, string | string[]>;
type Bank = { id: string; name: string };
type Row = { id: number; a: string; b: string; correct: boolean; locked: boolean };

const list = (d: Defaults | undefined, key: string) => {
  const v = d?.[key];
  return Array.isArray(v) ? v : v ? [v] : [];
};
const text = (d: Defaults | undefined, key: string) => {
  const v = d?.[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
};

/** Rows with stable ids, so removing one never shifts what the others hold. */
function useRows(initial: Omit<Row, "id">[], minimum: number) {
  const next = useRef(0);
  const make = (row: Partial<Omit<Row, "id">> = {}): Row => ({ id: next.current++, a: "", b: "", correct: false, locked: false, ...row });
  const [rows, setRows] = useState<Row[]>(() => {
    const seeded = initial.map(make);
    while (seeded.length < minimum) seeded.push(make());
    return seeded;
  });
  return {
    rows,
    setRows,
    add: () => setRows((r) => [...r, make()]),
    remove: (id: number) => setRows((r) => (r.length > minimum ? r.filter((x) => x.id !== id) : r)),
    patch: (id: number, change: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...change } : x))),
  };
}

function RowShell({ children, onRemove, canRemove, label }: { children: ReactNode; onRemove: () => void; canRemove: boolean; label: string }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
      {children}
      <Button type="button" variant="ghost" onClick={onRemove} disabled={!canRemove} aria-label={`Remove ${label}`}>Remove</Button>
    </li>
  );
}

const AddRow = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <Button type="button" variant="secondary" onClick={onClick}>{children}</Button>
);

function ChoiceFields({ multi, defaults }: { multi: boolean; defaults?: Defaults }) {
  const correct = new Set(list(defaults, "correct").map(Number));
  const locked = new Set(list(defaults, "locked").map(Number));
  const { rows, setRows, add, remove, patch } = useRows(
    list(defaults, "option").map((a, i) => ({ a, b: "", correct: correct.has(i), locked: locked.has(i) })),
    2,
  );
  const pick = (id: number, on: boolean) =>
    multi ? patch(id, { correct: on }) : setRows((r) => r.map((x) => ({ ...x, correct: x.id === id && on })));
  return (
    <fieldset className="mb-4 min-w-0">
      <legend className="mb-1 text-sm font-medium">Answer choices</legend>
      <p className="mb-2 text-sm text-muted">{multi ? "Tick every correct answer." : "Select the one correct answer."} Tick “Keep in place” for a choice such as “All of the above” that should never shuffle.</p>
      <ul className="mb-2 space-y-2">
        {rows.map((row, i) => (
          <RowShell key={row.id} label={`answer choice ${i + 1}`} canRemove={rows.length > 2} onRemove={() => remove(row.id)}>
            <input
              type={multi ? "checkbox" : "radio"}
              name="correct"
              value={i}
              checked={row.correct}
              onChange={(e) => pick(row.id, e.target.checked)}
              aria-label={`Answer choice ${i + 1} is correct`}
              className="size-5 shrink-0"
            />
            <Input name="option" value={row.a} onChange={(e) => patch(row.id, { a: e.target.value })} aria-label={`Answer choice ${i + 1}`} className="min-w-0 flex-1" />
            <label className="flex shrink-0 items-center gap-1 text-sm">
              <input type="checkbox" name="locked" value={i} checked={row.locked} onChange={(e) => patch(row.id, { locked: e.target.checked })} className="size-5" />
              Keep in place
            </label>
          </RowShell>
        ))}
      </ul>
      <AddRow onClick={add}>Add a choice</AddRow>
    </fieldset>
  );
}

function TrueFalseFields({ defaults }: { defaults?: Defaults }) {
  const initial = text(defaults, "truefalse");
  return (
    <fieldset className="mb-4">
      <legend className="mb-1 text-sm font-medium">Correct answer</legend>
      <div className="flex gap-6">
        {(["true", "false"] as const).map((v) => (
          <label key={v} className="touch-target flex items-center gap-2">
            <input type="radio" name="truefalse" value={v} defaultChecked={initial === v} className="size-5" />
            {v === "true" ? "True" : "False"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AcceptedFields({ defaults }: { defaults?: Defaults }) {
  const { rows, add, remove, patch } = useRows(list(defaults, "accepted").map((a) => ({ a, b: "", correct: false, locked: false })), 1);
  return (
    <fieldset className="mb-4 min-w-0">
      <legend className="mb-1 text-sm font-medium">Accepted answers</legend>
      <p className="mb-2 text-sm text-muted">Any one of these counts as correct.</p>
      <ul className="mb-2 space-y-2">
        {rows.map((row, i) => (
          <RowShell key={row.id} label={`accepted answer ${i + 1}`} canRemove={rows.length > 1} onRemove={() => remove(row.id)}>
            <Input name="accepted" value={row.a} onChange={(e) => patch(row.id, { a: e.target.value })} aria-label={`Accepted answer ${i + 1}`} className="min-w-0 flex-1" />
          </RowShell>
        ))}
      </ul>
      <AddRow onClick={add}>Add an accepted answer</AddRow>
    </fieldset>
  );
}

function MatchingFields({ defaults }: { defaults?: Defaults }) {
  const right = list(defaults, "right");
  const { rows, add, remove, patch } = useRows(list(defaults, "left").map((a, i) => ({ a, b: right[i] ?? "", correct: false, locked: false })), 2);
  return (
    <fieldset className="mb-4 min-w-0">
      <legend className="mb-1 text-sm font-medium">Matching pairs</legend>
      <p className="mb-2 text-sm text-muted">Each left item matches the right item beside it. Learners see the right-hand items shuffled.</p>
      <ul className="mb-2 space-y-2">
        {rows.map((row, i) => (
          <RowShell key={row.id} label={`pair ${i + 1}`} canRemove={rows.length > 2} onRemove={() => remove(row.id)}>
            <Input name="left" value={row.a} onChange={(e) => patch(row.id, { a: e.target.value })} aria-label={`Pair ${i + 1} left`} className="min-w-0 flex-1" />
            <Input name="right" value={row.b} onChange={(e) => patch(row.id, { b: e.target.value })} aria-label={`Pair ${i + 1} right`} className="min-w-0 flex-1" />
          </RowShell>
        ))}
      </ul>
      <AddRow onClick={add}>Add a pair</AddRow>
    </fieldset>
  );
}

function OrderingFields({ defaults }: { defaults?: Defaults }) {
  const { rows, add, remove, patch } = useRows(list(defaults, "orderItem").map((a) => ({ a, b: "", correct: false, locked: false })), 2);
  return (
    <fieldset className="mb-4 min-w-0">
      <legend className="mb-1 text-sm font-medium">Steps in the correct order</legend>
      <p className="mb-2 text-sm text-muted">Enter the steps from first to last. Learners see them shuffled.</p>
      <ol className="mb-2 space-y-2">
        {rows.map((row, i) => (
          <RowShell key={row.id} label={`step ${i + 1}`} canRemove={rows.length > 2} onRemove={() => remove(row.id)}>
            <span aria-hidden className="w-6 shrink-0 text-sm text-muted">{i + 1}.</span>
            <Input name="orderItem" value={row.a} onChange={(e) => patch(row.id, { a: e.target.value })} aria-label={`Step ${i + 1}`} className="min-w-0 flex-1" />
          </RowShell>
        ))}
      </ol>
      <AddRow onClick={add}>Add a step</AddRow>
    </fieldset>
  );
}

function FreeTextFields({ defaults }: { defaults?: Defaults }) {
  const points = list(defaults, "criterionPoints");
  const { rows, add, remove, patch } = useRows(list(defaults, "criterionName").map((a, i) => ({ a, b: points[i] ?? "", correct: false, locked: false })), 1);
  return (
    <>
      <fieldset className="mb-4 min-w-0">
        <legend className="mb-1 text-sm font-medium">Marking criteria</legend>
        <ul className="mb-2 space-y-2">
          {rows.map((row, i) => (
            <RowShell key={row.id} label={`criterion ${i + 1}`} canRemove={rows.length > 1} onRemove={() => remove(row.id)}>
              <Input name="criterionName" value={row.a} onChange={(e) => patch(row.id, { a: e.target.value })} aria-label={`Criterion ${i + 1} name`} className="min-w-0 flex-1" />
              <Input name="criterionPoints" type="number" min={1} inputMode="numeric" value={row.b} onChange={(e) => patch(row.id, { b: e.target.value })} aria-label={`Criterion ${i + 1} points`} className="w-24 shrink-0" />
            </RowShell>
          ))}
        </ul>
        <AddRow onClick={add}>Add a criterion</AddRow>
      </fieldset>
      <Field label="Model answer">
        <Textarea name="modelAnswer" rows={4} defaultValue={text(defaults, "modelAnswer")} />
      </Field>
    </>
  );
}

/** Bank, type and per-type fields. Renders no <form>, so it can sit in any form. */
export function QuestionFieldsEditor({ banks, defaults, defaultBankId, lockBank = false }: {
  banks: Bank[]; defaults?: Defaults; defaultBankId?: string; lockBank?: boolean;
}) {
  const [type, setType] = useState(text(defaults, "type") || "mcq_single");
  const bank = banks.find((b) => b.id === defaultBankId);
  return (
    <div className="min-w-0">
      {lockBank ? (
        <p className="mb-4 break-words text-sm"><span className="font-medium">Bank:</span> {bank?.name ?? "Unknown bank"}</p>
      ) : (
        <Field label="Bank">
          <Select name="bankId" defaultValue={defaultBankId ?? ""} required>
            <option value="" disabled>Choose a bank</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Question type">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(questionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Question">
        <Textarea name="prompt" rows={3} required defaultValue={text(defaults, "prompt")} />
      </Field>
      <Field label="Scenario (optional)" hint="Background learners read before the question.">
        <Textarea name="stimulus" rows={3} defaultValue={text(defaults, "stimulus")} />
      </Field>
      {type === "mcq_single" || type === "mcq_multi" ? <ChoiceFields key={type} multi={type === "mcq_multi"} defaults={defaults} /> : null}
      {type === "truefalse" ? <TrueFalseFields defaults={defaults} /> : null}
      {type === "fill_blank" ? <AcceptedFields defaults={defaults} /> : null}
      {type === "matching" ? <MatchingFields defaults={defaults} /> : null}
      {type === "ordering" ? <OrderingFields defaults={defaults} /> : null}
      {type === "free_text" ? <FreeTextFields defaults={defaults} /> : null}
      <Field label="Points">
        <Input name="points" type="number" min={1} inputMode="numeric" defaultValue={text(defaults, "points") || "1"} className="max-w-32" />
      </Field>
      <Field label="Explanation (optional)" hint="Shown to learners after they answer, when the quiz gives feedback.">
        <Textarea name="explanation" rows={2} defaultValue={text(defaults, "explanation")} />
      </Field>
    </div>
  );
}

export function QuestionEditor({ action, banks, defaults, defaultBankId, lockBank, submitLabel = "Save question" }: {
  action: (form: FormData) => Promise<ActionResult | void>;
  banks: Bank[]; defaults?: Defaults; defaultBankId?: string; lockBank?: boolean; submitLabel?: string;
}) {
  return (
    <WorkspaceForm action={action} className="min-w-0">
      <QuestionFieldsEditor banks={banks} defaults={defaults} defaultBankId={defaultBankId} lockBank={lockBank} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </WorkspaceForm>
  );
}
