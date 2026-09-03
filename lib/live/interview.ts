import { EndSensitivity, Modality, StartSensitivity, Type, type FunctionDeclaration, type LiveConnectConfig, type Schema } from "@google/genai";
import { z } from "zod";
import type { InterviewConfig, LiveEvaluation, LiveTurn } from "@/lib/db/schema";
import { LIVE_LANGUAGE, LIVE_VOICE, liveAvailable, textClient } from "./gemini";

/**
 * Oral check (spec FR-14.2): a short spoken interview about one lesson,
 * graded on a fixed 0–3 rubric per question. Optional and non-gating.
 */

export const QUESTION_COUNT = 3;
export const MAX_SCORE = 3;
export const PASS_PCT = 67;
export const CONTENT_CHAR_CAP = 24_000;

export type InterviewContent = { title: string; text: string; source: "video" | "text" | "mixed" };

// ---------------------------------------------------------------------------
// Admin configuration of an INTERVIEW lesson (spec FR-14.2 v1.4)
// ---------------------------------------------------------------------------

export const INTERVIEW_DEFAULTS: InterviewConfig = { questionCount: QUESTION_COUNT, passPct: PASS_PCT, maxMinutes: 6, scope: "module", requirePass: true };

export const InterviewConfigSchema = z.object({
  questionCount: z.coerce.number().int().min(1).max(6).default(QUESTION_COUNT),
  passPct: z.coerce.number().int().min(50).max(100).default(PASS_PCT),
  maxMinutes: z.coerce.number().int().min(3).max(9).default(6),
  scope: z.enum(["previous", "module", "course"]).default("module"),
  focus: z.string().trim().max(600).optional(),
  requirePass: z.boolean().default(true),
});

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== "" ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

/** Tolerant parse for stored payloads and admin forms (checkbox "on", strings, missing fields). */
export function parseInterviewConfig(input: Record<string, unknown> | null | undefined): InterviewConfig {
  const raw = input ?? {};
  const requirePass = raw.requirePass === undefined ? true : raw.requirePass === true || raw.requirePass === "on" || raw.requirePass === "true";
  const focus = typeof raw.focus === "string" && raw.focus.trim() ? raw.focus.trim().slice(0, 600) : undefined;
  const scope = raw.scope === "previous" || raw.scope === "course" ? raw.scope : "module";
  return {
    questionCount: clamp(raw.questionCount, 1, 6, QUESTION_COUNT),
    passPct: clamp(raw.passPct, 50, 100, PASS_PCT),
    maxMinutes: clamp(raw.maxMinutes, 3, 9, 6),
    scope,
    focus,
    requirePass,
  };
}

export type OutlineLesson = { id: string; type: string; moduleId: string };

/**
 * Which lessons an INTERVIEW lesson may ask about. "previous" = the nearest
 * earlier video/text lesson; "module" = the video/text lessons in its module;
 * "course" = all of them. Empty scopes fall back to the whole course so an
 * interviewer never runs with nothing to ask.
 */
export function pickScopeLessons(outline: Array<{ lessons: OutlineLesson[] }>, lessonId: string, scope: InterviewConfig["scope"]): string[] {
  const flat = outline.flatMap((o) => o.lessons);
  const idx = flat.findIndex((l) => l.id === lessonId);
  const self = idx >= 0 ? flat[idx] : null;
  const contentful = (l: OutlineLesson) => l.id !== lessonId && (l.type === "VIDEO" || l.type === "TEXT");
  const all = flat.filter(contentful).map((l) => l.id);
  if (scope === "previous") {
    const before = flat.slice(0, Math.max(0, idx)).filter(contentful);
    return before.length ? [before[before.length - 1].id] : all;
  }
  if (scope === "module" && self) {
    const inModule = flat.filter((l) => l.moduleId === self.moduleId && contentful(l)).map((l) => l.id);
    return inModule.length ? inModule : all;
  }
  return all;
}

/** What the interviewer may ask about: READY video transcripts or text lesson bodies. */
export function interviewContentFor(
  lesson: { type: string; title: string; payload: { body?: string } },
  video?: { ingestionStatus: string } | null,
  chunks?: Array<{ text: string }>,
): InterviewContent | null {
  if (lesson.type === "VIDEO") {
    if (!video || video.ingestionStatus !== "READY" || !chunks?.length) return null;
    const text = chunks.map((c) => c.text.trim()).filter(Boolean).join("\n");
    return text ? { title: lesson.title, text: text.slice(0, CONTENT_CHAR_CAP), source: "video" } : null;
  }
  if (lesson.type === "TEXT") {
    const body = (lesson.payload.body ?? "").trim();
    return body.length >= 80 ? { title: lesson.title, text: body.slice(0, CONTENT_CHAR_CAP), source: "text" } : null;
  }
  return null;
}

/** Base minutes (6 by default, admin-configurable) scaled by the assessment accommodation, capped under the Live connection limit. */
export function maxMinutesFor(timeMultiplier: number, base = 6): number {
  return Math.min(9, Math.max(3, Math.round(base * (timeMultiplier || 1))));
}

const EVALUATION_PARAMETERS: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      description: "One entry per question actually asked, in order",
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, description: "The question as asked" },
          answer_summary: { type: Type.STRING, description: "What the learner said, in one or two sentences" },
          score: { type: Type.INTEGER, description: "0 = wrong or no answer, 1 = partly right, 2 = mostly right, 3 = accurate and complete" },
          feedback: { type: Type.STRING, description: "One encouraging sentence the learner will read" },
        },
        required: ["question", "answer_summary", "score", "feedback"],
      },
    },
    overall_summary: { type: Type.STRING, description: "Two sentences on the learner's understanding of the lesson" },
    language: { type: Type.STRING, description: "Language the learner mostly spoke, e.g. en or ar" },
  },
  required: ["questions", "overall_summary"],
};

export const EVALUATION_TOOL: FunctionDeclaration = {
  name: "submit_evaluation",
  description: "Record the learner's oral-check result. Call exactly once, after the last answer (or when asked to stop).",
  parameters: EVALUATION_PARAMETERS,
};

export const EvaluationSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(600),
        answer_summary: z.string().trim().max(1200).default(""),
        score: z.number().int().min(0).max(MAX_SCORE),
        feedback: z.string().trim().max(800).default(""),
      }),
    )
    .min(1)
    .max(6),
  overall_summary: z.string().trim().max(1500).default(""),
  language: z.string().trim().max(16).optional(),
});

export function scoreEvaluation(ev: LiveEvaluation, passPct = PASS_PCT): { pct: number; outcome: "PASS" | "FAIL" } {
  const max = ev.questions.length * MAX_SCORE;
  const earned = ev.questions.reduce((s, q) => s + Math.max(0, Math.min(MAX_SCORE, q.score)), 0);
  const pct = max === 0 ? 0 : Math.round((earned / max) * 100);
  return { pct, outcome: pct >= passPct ? "PASS" : "FAIL" };
}

export function buildInterviewConfig(opts: {
  learnerFirstName: string;
  courseTitle: string;
  lessonTitle: string;
  content: InterviewContent;
  questionCount?: number;
  maxMinutes: number;
  voice?: string;
  resumeHandle?: string;
  focus?: string;
  objectives?: string[];
}): LiveConnectConfig {
  const n = opts.questionCount ?? QUESTION_COUNT;
  const focusLine = opts.focus ? `\n- Focus your questions on: ${opts.focus}.` : "";
  const objectivesLine = opts.objectives?.length ? `\nCourse objectives: ${opts.objectives.join("; ")}.` : "";
  const system = `You are the oral-check interviewer inside LuLu Learn, speaking with ${opts.learnerFirstName}, who just finished the lesson "${opts.lessonTitle}" in the course "${opts.courseTitle}".

Your job: check understanding with a short, friendly spoken conversation, then record the result with the submit_evaluation tool.

Rules:
- Open with one warm sentence: greet ${opts.learnerFirstName}, say you are an AI, that you will ask up to ${n} short questions about the lesson, and that it takes about three minutes. Then ask question 1.
- Ask ONLY about the LESSON CONTENT below. One question at a time, in plain spoken English, ten to twenty words. Wait for the answer.
- If an answer is thin or unclear, ask one short follow-up. Then move on. Acknowledge briefly ("Thanks", "Okay") — never say whether the answer was right, and never give scores or feedback aloud.
- Do not give the answers away during the check. If asked, say you will share feedback at the end.
- Conduct the whole check in English, and keep your own questions in English throughout. If ${opts.learnerFirstName} answers in another language, say once: \"Could you answer in English, please?\" and repeat the question. Do not switch languages yourself.
- After the last answer — or if ${opts.learnerFirstName} asks to stop, or you are told time is up — say thank you, then call submit_evaluation exactly once with every question you asked. Scores: 3 accurate and complete, 2 mostly right, 1 partly right, 0 wrong or no answer. Feedback must be specific and encouraging.
- After the tool call, close with one sentence: the result is on screen now. Then stop talking.
- Keep the whole check under ${opts.maxMinutes} minutes.${focusLine}${objectivesLine}

LESSON CONTENT (${opts.content.source === "video" ? "video transcript" : opts.content.source === "mixed" ? "lesson transcripts and texts" : "lesson text"}):
${opts.content.text}`;
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: system,
    tools: [{ functionDeclarations: [EVALUATION_TOOL] }],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice ?? LIVE_VOICE } } },
    // Pin the transcription language. Left to auto-detect, a learner speaking
    // accented English gets transcribed into Hindi or Malayalam mid-answer.
    inputAudioTranscription: { languageCodes: [LIVE_LANGUAGE] },
    outputAudioTranscription: {},
    // The default end-of-turn threshold makes the interviewer feel slow to
    // answer. 800ms is well short of the default but still leaves room for the
    // pauses people take while recalling something they have just learned —
    // the assistant, which is pure conversation, sits at 500ms.
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 100,
        silenceDurationMs: 800,
      },
    },
    sessionResumption: opts.resumeHandle ? { handle: opts.resumeHandle } : {},
  };
}

// ---------------------------------------------------------------------------
// Mock + fallback grading (no key, or the model never submitted)
// ---------------------------------------------------------------------------

const STOP = new Set(["that", "this", "with", "from", "they", "them", "then", "than", "have", "will", "your", "what", "when", "were", "there", "their", "about", "which", "would", "should", "could", "into", "also", "been", "being", "these", "those", "some", "every", "always", "never", "just", "like", "make", "made", "does", "very", "more", "most", "such", "only", "over", "before", "after"]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function sentences(text: string): string[] {
  const plain = text
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)]|>)\s+/gm, "")
    .replace(/[*_`]/g, "");
  return plain
    .split(/\n+|(?<=[.!?])\s+/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 30 && x.length <= 240);
}

const GENERIC_QUESTIONS = [
  "In your own words, what was the main point of this lesson?",
  "What is one thing from this lesson you will do differently at work?",
  "Why does this matter for customers or colleagues?",
];

/** Deterministic questions spread across the content, for offline demo mode. */
export function mockQuestions(content: InterviewContent, n = QUESTION_COUNT): string[] {
  const pool = sentences(content.text);
  const out: string[] = [];
  const picks = Math.min(n, pool.length);
  for (let i = 0; i < picks; i++) {
    const s = pool[Math.floor((i * pool.length) / picks)];
    out.push(`The lesson says: “${s}” — in your own words, why does that matter at work?`);
  }
  for (let i = 0; out.length < n && i < GENERIC_QUESTIONS.length; i++) {
    out.push(GENERIC_QUESTIONS[i].replace("this lesson", `"${content.title}"`));
  }
  return out;
}

/** Keyword-overlap grading, like the quiz engine's offline free-text grader. Honest, not clever. */
export function mockEvaluate(content: InterviewContent, qa: Array<{ question: string; answer: string }>): LiveEvaluation {
  const contentTokens = new Set(tokens(content.text));
  const questions = qa.map(({ question, answer }) => {
    const words = tokens(answer);
    const distinct = new Set(words);
    const overlap = [...distinct].filter((w) => contentTokens.has(w)).length;
    const ratio = distinct.size === 0 ? 0 : overlap / Math.min(8, distinct.size);
    const score = answer.trim().split(/\s+/).length < 3 ? 0 : Math.min(MAX_SCORE, Math.round(ratio * MAX_SCORE));
    const feedback =
      score >= 3 ? "You covered the key points from the lesson clearly."
      : score === 2 ? "Mostly there — you touched the main idea; add the specific steps the lesson named."
      : score === 1 ? "You mentioned something related; revisit this part of the lesson for the details."
      : "This one didn't match the lesson — worth a quick re-watch of that section.";
    return { question, answer_summary: answer.trim().slice(0, 400) || "(no answer)", score, feedback };
  });
  const { pct } = scoreEvaluation({ questions, overall_summary: "" });
  return {
    questions,
    overall_summary: `Offline demo grading by keyword overlap: ${pct}% of the rubric. A person should confirm this result.`,
    language: "en",
  };
}

/** Pair each interviewer question with the learner's next answer. */
export function pairTranscript(transcript: LiveTurn[]): Array<{ question: string; answer: string }> {
  const qa: Array<{ question: string; answer: string }> = [];
  let pending: string | null = null;
  for (const turn of transcript) {
    if (turn.role === "assistant") {
      if (/[?؟]\s*$/.test(turn.text.trim()) || pending === null) pending = turn.text;
    } else if (pending) {
      qa.push({ question: pending, answer: turn.text });
      pending = null;
    }
  }
  return qa;
}

/** Grades a stored transcript when the live model never called submit_evaluation. */
export async function fallbackEvaluate(transcript: LiveTurn[], content: InterviewContent): Promise<{ evaluation: LiveEvaluation; source: "fallback" | "mock" }> {
  const qa = pairTranscript(transcript);
  if (liveAvailable()) {
    try {
      const res = await textClient().models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Grade this oral check transcript against the lesson content. Return JSON only.\n\nLESSON CONTENT:\n${content.text.slice(0, 12_000)}\n\nTRANSCRIPT:\n${transcript
          .map((t) => `${t.role === "user" ? "Learner" : "Interviewer"}: ${t.text}`)
          .join("\n")}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: EVALUATION_PARAMETERS,
          systemInstruction: "You grade short oral checks. Scores: 3 accurate and complete, 2 mostly right, 1 partly right, 0 wrong or no answer. Feedback is one encouraging, specific sentence.",
        },
      });
      const parsed = EvaluationSchema.safeParse(JSON.parse(res.text ?? "{}"));
      if (parsed.success) return { evaluation: parsed.data, source: "fallback" };
    } catch {
      /* fall through to the offline grader */
    }
  }
  return { evaluation: mockEvaluate(content, qa.length ? qa : [{ question: "(no question recorded)", answer: "" }]), source: "mock" };
}
