import type { QuestionBody, Rubric } from "@/lib/db/schema";
import { Chip } from "@/components/ui";

export const questionTypeLabels: Record<string, string> = {
  mcq_single: "Single choice", mcq_multi: "Multiple choice", truefalse: "True or false",
  fill_blank: "Fill in the blank", matching: "Matching", ordering: "Ordering", free_text: "Written response",
};

/** Expected answers in the same terms the human reviewer uses to judge them. */
export function QuestionGuide({ type, body, rubric }: { type: string; body: QuestionBody; rubric: Rubric | null }) {
  return <section aria-label="Question answer guide" className="my-4 min-w-0 space-y-4 break-words">
    {body.stimulus ? <div><h3 className="mb-1 font-semibold">Scenario</h3><p className="whitespace-pre-wrap">{body.stimulus}</p></div> : null}
    {type === "mcq_single" || type === "mcq_multi" ? <div>
      <h3 className="mb-2 font-semibold">Answer choices</h3>
      <p className="mb-2 text-muted">{type === "mcq_multi" ? "Learners must select every correct answer." : "Learners select one answer."}</p>
      <ul aria-label="Answer choices" className="divide-y divide-border">{body.options?.map((option, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{option}</span>{body.correct?.includes(index) ? <Chip variant="success">Correct answer</Chip> : null}</li>)}</ul>
      {!body.correct?.length ? <p className="text-destructive-text">No correct answer supplied.</p> : null}
    </div> : null}
    {type === "truefalse" ? <div><h3 className="mb-1 font-semibold">Correct answer</h3><p>{body.correct?.[0] === 0 ? "True" : body.correct?.[0] === 1 ? "False" : "No correct answer supplied."}</p></div> : null}
    {type === "fill_blank" ? <div><h3 className="mb-2 font-semibold">Accepted answers</h3><ul aria-label="Accepted answers" className="list-disc space-y-1 ps-5">{body.acceptedAnswers?.map((answer, index) => <li key={index}>{answer}</li>)}</ul>{!body.acceptedAnswers?.length ? <p className="text-destructive-text">No accepted answers supplied.</p> : null}</div> : null}
    {type === "matching" ? <div><h3 className="mb-2 font-semibold">Correct pairs</h3><ul aria-label="Correct pairs" className="divide-y divide-border">{body.pairs?.map((pair, index) => <li key={index} className="py-2"><span className="font-medium">{pair.left}</span>{" → "}{pair.right}</li>)}</ul>{!body.pairs?.length ? <p className="text-destructive-text">No matching pairs supplied.</p> : null}</div> : null}
    {type === "ordering" ? <div><h3 className="mb-2 font-semibold">Correct order</h3><ol aria-label="Correct order" className="list-decimal space-y-2 ps-5">{body.orderItems?.map((step, index) => <li key={index}>{step}</li>)}</ol>{!body.orderItems?.length ? <p className="text-destructive-text">No ordered steps supplied.</p> : null}</div> : null}
    {type === "free_text" ? <div><h3 className="mb-2 font-semibold">Marking rubric</h3>{rubric ? <><ul aria-label="Marking rubric" className="mb-4 list-disc space-y-1 ps-5">{rubric.criteria.map((criterion, index) => <li key={index}>{criterion.name} · {criterion.points} {criterion.points === 1 ? "point" : "points"}</li>)}</ul><h3 className="mb-1 font-semibold">Model answer</h3><p className="whitespace-pre-wrap">{rubric.modelAnswer || "No model answer supplied."}</p></> : <p className="text-destructive-text">No marking rubric supplied.</p>}</div> : null}
    {body.explanation ? <div><h3 className="mb-1 font-semibold">Explanation</h3><p className="whitespace-pre-wrap text-muted">{body.explanation}</p></div> : null}
  </section>;
}
