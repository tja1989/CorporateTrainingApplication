import type { t } from "@/lib/db/client";
import type { ServedItem } from "@/lib/db/schema";
import type { Served } from "@/components/question-input";

/** One question as the learner sees it: shuffled display order, no answer key. */
export function toServed(q: typeof t.questions.$inferSelect, s: ServedItem): Served {
  const co = s.choiceOrder;
  const displayOptions = (arr?: string[]) => (arr && co ? co.map((actual) => arr[actual]) : arr);
  return {
    questionId: q.id,
    type: q.type,
    points: q.points,
    prompt: q.body.prompt,
    stimulus: q.body.stimulus ?? null,
    options: q.type === "truefalse" ? ["True", "False"] : (displayOptions(q.body.options) ?? null),
    left: q.body.pairs?.map((p) => p.left) ?? null,
    right: co && q.body.pairs ? co.map((actual) => q.body.pairs![actual].right) : (q.body.pairs?.map((p) => p.right) ?? null),
    orderItems: co && q.body.orderItems ? co.map((actual) => q.body.orderItems![actual]) : (q.body.orderItems ?? null),
  };
}
