"use client";
import { Icon } from "@/components/icons";
import { Button, Card, Input, Select, Textarea, cx } from "@/components/ui";
import type { Answer } from "@/lib/quiz/scoring";

export type Served = {
  questionId: string;
  type: string;
  points: number;
  prompt: string;
  stimulus: string | null;
  options: string[] | null;
  left: string[] | null;
  right: string[] | null;
  orderItems: string[] | null;
};

const optionRow = "touch-target rounded-input border px-3 py-2 text-start text-sm";

type Props = { q: Served; answer: Answer | undefined; onChange: (a: Answer) => void };
export function QuestionInput(props: Props) {
  return <Card id={`question-${props.q.questionId}`} className="mb-3 p-4"><QuestionFields {...props} /></Card>;
}
export function QuestionFields({ q, answer, onChange }: Props) {
  return (
    <>
      {q.stimulus ? <p className="mb-2 rounded-control bg-surface-2 p-3 text-sm">{q.stimulus}</p> : null}
      <h2 id={`prompt-${q.questionId}`} className="mb-3 text-lg font-medium">{q.prompt}</h2>

      {(q.type === "mcq_single" || q.type === "truefalse") && q.options ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={q.prompt}>
          {q.options.map((opt, i) => {
            const selected = answer?.kind === "choice" && answer.selected[0] === i;
            return (
              <label key={i} className={cx(optionRow, "flex cursor-pointer items-center gap-3", selected ? "border-primary bg-accent-tint" : "border-border hover:bg-surface-2")}>
                <input type="radio" name={`answer-${q.questionId}`} checked={!!selected} onChange={() => onChange({ kind: "choice", selected: [i] })} className="size-4" />{opt}
              </label>
            );
          })}
        </div>
      ) : null}

      {q.type === "mcq_multi" && q.options ? (
        <div className="flex flex-col gap-2">
          {q.options.map((opt, i) => {
            const selected = answer?.kind === "choice" && answer.selected.includes(i);
            return (
              <label
                key={i}
                className={cx(optionRow, "flex cursor-pointer items-center gap-2", selected ? "border-primary bg-success-tint" : "border-border hover:bg-surface-2")}
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={!!selected}
                  onChange={(e) => {
                    const prev = answer?.kind === "choice" ? answer.selected : [];
                    onChange({ kind: "choice", selected: e.target.checked ? [...prev, i] : prev.filter((x) => x !== i) });
                  }}
                />
                {opt}
              </label>
            );
          })}
        </div>
      ) : null}

      {q.type === "fill_blank" ? (
        <Input
          value={answer?.kind === "text" ? answer.text : ""}
          onChange={(e) => onChange({ kind: "text", text: e.target.value })}
          aria-labelledby={`prompt-${q.questionId}`}
          placeholder="Type your answer"
        />
      ) : null}

      {q.type === "free_text" ? (
        <Textarea
          value={answer?.kind === "text" ? answer.text : ""}
          onChange={(e) => onChange({ kind: "text", text: e.target.value })}
          rows={5}
          aria-labelledby={`prompt-${q.questionId}`}
          placeholder="Write your answer in any language…"
        />
      ) : null}

      {q.type === "matching" && q.left && q.right ? (
        <div className="flex flex-col gap-2">
          {q.left.map((left, li) => (
            <div key={li} className="flex items-center gap-2 text-sm">
              <span className="w-2/5">{left}</span>
              <Select
                value={answer?.kind === "matching" ? (answer.pairs[li] ?? "") : ""}
                onChange={(e) => {
                  const prev = answer?.kind === "matching" ? { ...answer.pairs } : {};
                  prev[li] = Number(e.target.value);
                  onChange({ kind: "matching", pairs: prev });
                }}
                className="min-w-0 flex-1"
                aria-label={`Match for ${left}`}
              >
                <option value="" disabled>Choose…</option>
                {q.right!.map((right, ri) => (
                  <option key={ri} value={ri}>{right}</option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      ) : null}

      {q.type === "ordering" && q.orderItems ? (
        <OrderingInput items={q.orderItems} answer={answer} onChange={onChange} />
      ) : null}
    </>
  );
}

/** Tap-based reordering (up/down buttons) — no drag required (SC 2.5.7). */
function OrderingInput({ items, answer, onChange }: { items: string[]; answer: Answer | undefined; onChange: (a: Answer) => void }) {
  const order = answer?.kind === "ordering" ? answer.order : items.map((_, i) => i);
  const move = (pos: number, dir: -1 | 1) => {
    const next = [...order];
    const target = pos + dir;
    if (target < 0 || target >= next.length) return;
    [next[pos], next[target]] = [next[target], next[pos]];
    onChange({ kind: "ordering", order: next });
  };
  return (
    <div><ol className="flex flex-col gap-2">
      {order.map((displayIdx, pos) => (
        <li key={displayIdx} className="flex items-center gap-2 rounded-input border border-border px-3 py-2 text-sm">
          <span className="w-6 text-xs text-muted">{pos + 1}.</span>
          <span className="flex-1">{items[displayIdx]}</span>
          <button onClick={() => move(pos, -1)} aria-label={`Move ${items[displayIdx]} up`} className="touch-target pressable rounded-control px-2 hover:bg-surface-2 disabled:opacity-50" disabled={pos === 0}><Icon name="arrow-up" size={16} /></button>
          <button onClick={() => move(pos, 1)} aria-label={`Move ${items[displayIdx]} down`} className="touch-target pressable rounded-control px-2 hover:bg-surface-2 disabled:opacity-50" disabled={pos === order.length - 1}><Icon name="arrow-down" size={16} /></button>
        </li>
      ))}
    </ol>{answer?.kind !== "ordering" ? <Button variant="secondary" className="mt-3" onClick={() => onChange({ kind: "ordering", order })}>Use this order</Button> : <p className="mt-2 text-sm text-muted">Order recorded. Use the arrows to change it.</p>}</div>
  );
}
