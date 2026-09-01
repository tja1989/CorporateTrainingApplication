import { aiAvailable, structuredCall, redactPii, MODEL, PROMPT_VERSION } from "@/lib/ai/gateway";
import type { Rubric } from "@/lib/db/schema";

/**
 * AI rubric grading (spec FR-6.10). Routing rule (employment-safe):
 * - AI PASS with confidence ≥ 0.7 and margin > 5pp above threshold → auto-final
 * - EVERY AI FAIL on a required-completion assessment → human queue, always
 * - low confidence (<0.7) or borderline (±5pp of threshold) → human queue
 */

export const CONFIDENCE_THRESHOLD = 0.7;
export const BORDERLINE_PP = 5;

export type GradeResult = {
  scores: Array<{ criterion: string; points: number; max: number }>;
  rationale: string;
  confidence: number;
  earned: number;
  max: number;
  modelVersion: string;
  promptVersion: string;
};

export async function gradeFreeText(opts: {
  question: string;
  rubric: Rubric;
  answer: string;
  questionPoints: number;
}): Promise<GradeResult> {
  const rubricMax = opts.rubric.criteria.reduce((s, c) => s + c.points, 0) || 1;

  if (!aiAvailable()) {
    // Honest mock: keyword overlap between the answer and the model answer,
    // spread across criteria; mid confidence so borderline cases route to humans.
    const modelWords = new Set(opts.rubric.modelAnswer.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const answerWords = new Set(opts.answer.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    let overlap = 0;
    for (const w of answerWords) if (modelWords.has(w)) overlap++;
    const ratio = modelWords.size === 0 ? 0 : Math.min(1, overlap / (modelWords.size * 0.5));
    const scores = opts.rubric.criteria.map((c) => ({
      criterion: c.name,
      points: Math.round(c.points * ratio * 2) / 2,
      max: c.points,
    }));
    const earnedRubric = scores.reduce((s, c) => s + c.points, 0);
    return {
      scores,
      rationale:
        "Offline demo grading: scored by keyword overlap with the model answer. A human reviewer confirms this result.",
      confidence: 0.5,
      earned: (earnedRubric / rubricMax) * opts.questionPoints,
      max: opts.questionPoints,
      modelVersion: "mock",
      promptVersion: PROMPT_VERSION,
    };
  }

  const { text: safeAnswer } = redactPii(opts.answer);
  const result = await structuredCall<{
    scores: Array<{ criterion: string; points: number }>;
    rationale: string;
    confidence: number;
  }>({
    route: "grading",
    system:
      "You grade a retail employee's free-text training answer against a rubric. Score each criterion 0..max (halves allowed). Write a short, kind rationale the learner will read (they may be an ESL speaker — answers in any language are acceptable; grade the substance). Set confidence 0..1 for how certain you are of the total.",
    user: `Question: ${opts.question}\n\nRubric criteria:\n${opts.rubric.criteria
      .map((c) => `- ${c.name} (max ${c.points})`)
      .join("\n")}\n\nModel answer: ${opts.rubric.modelAnswer}\n\nLearner answer: ${safeAnswer}`,
    schemaName: "grade",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["scores", "rationale", "confidence"],
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["criterion", "points"],
            properties: { criterion: { type: "string" }, points: { type: "number" } },
          },
        },
        rationale: { type: "string" },
        confidence: { type: "number" },
      },
    },
    effort: "high",
    maxTokens: 1000,
  });

  const scores = opts.rubric.criteria.map((c) => {
    const got = result.scores.find((s) => s.criterion === c.name)?.points ?? 0;
    return { criterion: c.name, points: Math.max(0, Math.min(c.points, got)), max: c.points };
  });
  const earnedRubric = scores.reduce((s, c) => s + c.points, 0);
  return {
    scores,
    rationale: result.rationale,
    confidence: Math.max(0, Math.min(1, result.confidence)),
    earned: (earnedRubric / rubricMax) * opts.questionPoints,
    max: opts.questionPoints,
    modelVersion: MODEL,
    promptVersion: PROMPT_VERSION,
  };
}

export type RoutingInput = {
  finalPct: number;
  passPct: number;
  confidence: number;
  gatesRequiredCompletion: boolean;
};

/** Pure routing decision — unit-tested (spec FR-6.10). */
export function gradeRouting(input: RoutingInput): { finalize: boolean; reason: "ai_fail" | "low_conf" | "borderline" | null } {
  const passed = input.finalPct >= input.passPct;
  if (!passed && input.gatesRequiredCompletion) return { finalize: false, reason: "ai_fail" };
  if (input.confidence < CONFIDENCE_THRESHOLD) return { finalize: false, reason: "low_conf" };
  if (Math.abs(input.finalPct - input.passPct) <= BORDERLINE_PP) return { finalize: false, reason: "borderline" };
  return { finalize: true, reason: null };
}
