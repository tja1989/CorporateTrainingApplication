import { z } from "zod";
import type { LiveCitation, LiveEvaluation, LiveTurn } from "@/lib/db/schema";

/**
 * Types and request schemas shared by the Live voice routes and the browser
 * client (spec FR-14). Browser-safe: no server imports.
 */

export type LiveKind = "hr" | "interview";

export type Turn = LiveTurn & { id: string; final: boolean };

export type LiveUsage = { inputTokens: number; outputTokens: number; inputAudioTokens: number; outputAudioTokens: number };

/** What `/api/live/<kind>/session` returns. `mock` sessions never carry a token. */
export type SessionInfo = {
  mock: boolean;
  model: string;
  token?: string;
  expiresAt?: string;
  warning?: string;
  conversationId?: string;
  interviewId?: string;
  questionCount?: number;
  maxMinutes?: number;
  passPct?: number;
  questions?: string[];
};

export type Evaluation = LiveEvaluation;
export type Citation = LiveCitation;

/** Stable identity for dedupe: policy chips by doc+section, lesson chips by lesson. */
export function citationKey(c: Citation): string {
  return c.kind === "lesson" ? `lesson:${c.lessonId}` : `policy:${c.docId}::${c.sectionPath}`;
}

const CitationSchema = z.union([
  z.object({
    kind: z.literal("policy").optional(),
    docId: z.string(),
    title: z.string(),
    sectionPath: z.string(),
    version: z.number(),
    effectiveDate: z.string(),
  }),
  z.object({ kind: z.literal("lesson"), title: z.string(), lessonId: z.string(), courseTitle: z.string(), href: z.string() }),
]);

export const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(4000),
  at: z.string().optional(),
  citations: z.array(CitationSchema).max(8).optional(),
  mock: z.boolean().optional(),
});

export const UsageSchema = z
  .object({
    inputTokens: z.number().int().min(0).max(50_000_000),
    outputTokens: z.number().int().min(0).max(50_000_000),
    inputAudioTokens: z.number().int().min(0).max(50_000_000),
    outputAudioTokens: z.number().int().min(0).max(50_000_000),
  })
  .partial();

export const HrSessionBody = z.object({
  conversationId: z.string().optional(),
  resumeHandle: z.string().max(4000).optional(),
});

export const HrEventBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn"), conversationId: z.string(), turns: z.array(TurnSchema).min(1).max(50) }),
  z.object({ type: z.literal("tool"), conversationId: z.string(), name: z.string().max(64), args: z.record(z.unknown()).default({}) }),
  z.object({ type: z.literal("escalate"), conversationId: z.string(), subject: z.string().max(200).optional() }),
  z.object({ type: z.literal("end"), conversationId: z.string(), model: z.string().max(80).optional(), usage: UsageSchema.optional(), durationMs: z.number().int().min(0).optional() }),
]);

export const InterviewSessionBody = z.object({
  lessonId: z.string(),
  interviewId: z.string().optional(),
  resumeHandle: z.string().max(4000).optional(),
});

export const InterviewEventBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn"), interviewId: z.string(), turns: z.array(TurnSchema).min(1).max(50) }),
  z.object({ type: z.literal("tool"), interviewId: z.string(), name: z.string().max(64), args: z.record(z.unknown()).default({}) }),
  z.object({
    type: z.literal("mock_evaluate"),
    interviewId: z.string(),
    qa: z.array(z.object({ question: z.string().max(1000), answer: z.string().max(4000) })).max(6),
  }),
  z.object({ type: z.literal("end"), interviewId: z.string(), model: z.string().max(80).optional(), usage: UsageSchema.optional(), durationMs: z.number().int().min(0).optional() }),
]);

/** Tool names the browser may forward to the server. Anything else is rejected. */
export const HR_TOOL_NAMES = ["search_hr_policy", "search_course_content", "my_training_status", "escalate_to_hr"] as const;
/** Tools declared NON_BLOCKING — their responses are queued behind the model's filler phrase (WHEN_IDLE). */
export const NON_BLOCKING_TOOLS = ["search_hr_policy", "search_course_content"] as const;
export const INTERVIEW_TOOL_NAMES = ["submit_evaluation"] as const;

export const KICKOFF_TEXT = "[session started — greet the learner and begin]";

/** Protobuf Duration strings ("10s", "1.5s") → seconds. */
export function parseDuration(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(s.trim());
  return m ? Number(m[1]) : null;
}
