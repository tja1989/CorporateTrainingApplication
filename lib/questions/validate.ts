import type { questions, QuestionBody, Rubric } from "@/lib/db/schema";

export type QuestionType = (typeof questions.$inferSelect)["type"];
export type QuestionDraft = {
  type: QuestionType;
  points: number;
  body: QuestionBody;
  rubric: Rubric | null;
};
type Result = { ok: true; value: QuestionDraft } | { ok: false; error: string };

const TYPES: QuestionType[] = ["mcq_single", "mcq_multi", "truefalse", "fill_blank", "matching", "ordering", "free_text"];

const one = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};
const many = (form: FormData, key: string) =>
  form.getAll(key).map((v) => (typeof v === "string" ? v.trim() : ""));
const nonEmpty = (xs: string[]) => xs.filter(Boolean);
const wholeNumber = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);
const fail = (error: string): Result => ({ ok: false, error });

export function parseQuestionForm(form: FormData): Result {
  const prompt = one(form, "prompt");
  if (!prompt) return fail("Enter the question.");
  const type = one(form, "type") as QuestionType;
  if (!TYPES.includes(type)) return fail("Choose a question type.");

  const pointsText = one(form, "points");
  const points = pointsText === "" ? 1 : wholeNumber(pointsText);
  if (!Number.isInteger(points) || points < 1) return fail("Points must be a whole number of 1 or more.");

  const body: QuestionBody = { prompt };
  const stimulus = one(form, "stimulus");
  if (stimulus) body.stimulus = stimulus;
  let rubric: Rubric | null = null;

  if (type === "mcq_single" || type === "mcq_multi") {
    // Indices are positions in the submitted list; remap them after blank rows are dropped.
    const raw = many(form, "option");
    const newIndex = new Map<number, number>();
    const options: string[] = [];
    raw.forEach((text, i) => {
      if (text) {
        newIndex.set(i, options.length);
        options.push(text);
      }
    });
    if (options.length < 2) return fail("Add at least two answer choices.");
    const remap = (key: string) =>
      [...new Set(many(form, key).map(wholeNumber))]
        .map((i) => newIndex.get(i))
        .filter((i): i is number => i !== undefined)
        .sort((a, b) => a - b);
    const correct = remap("correct");
    if (type === "mcq_single" && correct.length !== 1) return fail("Mark exactly one correct answer.");
    if (correct.length === 0) return fail("Mark at least one correct answer.");
    body.options = options;
    body.correct = correct;
    const locked = remap("locked");
    if (locked.length) body.lockedOptionIndices = locked;
  } else if (type === "truefalse") {
    const tf = one(form, "truefalse");
    if (tf !== "true" && tf !== "false") return fail("Choose whether the statement is true or false.");
    body.correct = [tf === "true" ? 0 : 1];
  } else if (type === "fill_blank") {
    const accepted = nonEmpty(many(form, "accepted"));
    if (!accepted.length) return fail("Add at least one accepted answer.");
    body.acceptedAnswers = accepted;
  } else if (type === "matching") {
    const left = many(form, "left");
    const right = many(form, "right");
    const pairs = left
      .map((l, i) => ({ left: l, right: right[i] ?? "" }))
      .filter((p) => p.left && p.right);
    if (pairs.length < 2) return fail("Add at least two complete pairs.");
    body.pairs = pairs;
  } else if (type === "ordering") {
    const items = nonEmpty(many(form, "orderItem"));
    if (items.length < 2) return fail("Add at least two steps in the correct order.");
    body.orderItems = items;
  } else {
    const names = many(form, "criterionName");
    const pts = many(form, "criterionPoints");
    const criteria = names
      .map((name, i) => ({ name, points: wholeNumber(pts[i] ?? "") }))
      .filter((c) => c.name && c.points >= 1);
    if (!criteria.length) return fail("Add at least one marking criterion with points.");
    const modelAnswer = one(form, "modelAnswer");
    if (!modelAnswer) return fail("Add a model answer.");
    rubric = { criteria, modelAnswer };
  }

  const explanation = one(form, "explanation");
  if (explanation) body.explanation = explanation;
  return { ok: true, value: { type, points, body, rubric } };
}

export function draftToFormDefaults(q: QuestionDraft): Record<string, string | string[]> {
  const { body, rubric } = q;
  const out: Record<string, string | string[]> = {
    type: q.type,
    prompt: body.prompt,
    points: String(q.points),
  };
  if (body.stimulus) out.stimulus = body.stimulus;
  if (body.explanation) out.explanation = body.explanation;
  if (body.options) out.option = body.options;
  if (q.type === "truefalse") out.truefalse = body.correct?.[0] === 0 ? "true" : "false";
  else if (body.correct) out.correct = body.correct.map(String);
  if (body.lockedOptionIndices) out.locked = body.lockedOptionIndices.map(String);
  if (body.acceptedAnswers) out.accepted = body.acceptedAnswers;
  if (body.pairs) {
    out.left = body.pairs.map((p) => p.left);
    out.right = body.pairs.map((p) => p.right);
  }
  if (body.orderItems) out.orderItem = body.orderItems;
  if (rubric) {
    out.criterionName = rubric.criteria.map((c) => c.name);
    out.criterionPoints = rubric.criteria.map((c) => String(c.points));
    out.modelAnswer = rubric.modelAnswer;
  }
  return out;
}
