import { Behavior, EndSensitivity, Modality, StartSensitivity, Type, type FunctionDeclaration, type LiveConnectConfig } from "@google/genai";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { searchPolicyChunks } from "@/lib/retrieval";
import { redactPii } from "@/lib/ai/gateway";
import { DETERMINATION_FOOTER, detectLanguage, screenInput } from "@/lib/hr/guardrails";
import { HR_ABSTENTION, auditHrTurn, docsForHits, extractiveAnswer, retrievalConfident, toCitation } from "@/lib/hr/assistant";
import { hrScopeFor } from "@/lib/hr/scope";
import { localDate } from "@/lib/time";
import type { LiveCitation } from "@/lib/db/schema";
import { LIVE_LANGUAGE, LIVE_VOICE } from "./gemini";
import { learnerContextLines, searchCourseContent, trainingStatus, type TrainingStatus } from "./course-tools";

/**
 * The voice assistant (spec FR-14.3 v1.4): HR policy AND the learner's own
 * courses, spoken. Same guardrails as the text agent — the model may only
 * speak what the tools return, and a ticket is never created without the
 * employee's on-screen confirmation. Searches are NON_BLOCKING so the model
 * says its filler while retrieval runs and answers the moment results land.
 */

export const HR_VOICE_SYSTEM = `You are the xprtn assistant, speaking with an employee by voice. xprtn is the company's training app. You can do three things: quote company HR policy, quote the employee's own assigned course content, and report their training status. You cannot change records, approve anything, or see other people's data.

How to work:
- The employee has already been told you are an AI. Start with one short, warm greeting that uses their first name and invites a question.
- Route every question to a tool before answering:
  • HR policy (leave, pay, hours, overtime, end of service, conduct, benefits) → call search_hr_policy.
  • Their training ("what's due", "what do I have to finish", "how far am I") → call my_training_status. You already have a summary in LEARNER CONTEXT below; use the tool when they want details.
  • Their course content ("what did the lesson say", "how do I…", topics from their courses) → call search_course_content.
- While a search runs, say ONE short phrase such as "Let me check that" — then stop and wait for the result. Never fill the gap with guesses.
- Answer only from what the tool returns. For policy, begin with "Per the <policy name>"; for course content, name the course or lesson. One or two short, plain sentences per turn. Do not read section paths, version numbers or links aloud.
- If a tool says nothing was found, or returns a guardrail message, read that message aloud and offer to connect them with a person.
- The first time you give a policy answer in this conversation, add: "${DETERMINATION_FOOTER}" Say it once, not every turn.
- Never promise outcomes, never make determinations, never give legal, medical, visa or salary-negotiation advice. If the employee describes harassment, bullying or discrimination, respond with care and offer a person right away.
- When the employee wants to talk to a person, call escalate_to_hr. The app then shows them a confirmation card; tell them to tap it if they want HR to see this conversation, and do not claim a ticket was sent.
- Speak English. If the employee speaks another language, briefly say in that language that voice answers are in English for now, then continue in English and offer a person if that is easier for them.
- Be brief, warm and ESL-friendly. Wait for the employee to finish before answering.`;

export const HR_TOOLS: FunctionDeclaration[] = [
  {
    name: "search_hr_policy",
    description: "Look up the current HR policy for the employee's question. Returns policy excerpts to answer from, or a message to read aloud.",
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: "The employee's question, in their words" } },
      required: ["query"],
    },
  },
  {
    name: "search_course_content",
    description: "Search the employee's own assigned course lessons and video transcripts. Returns excerpts naming the course and lesson.",
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "What to look for, in the employee's words" },
        course_title: { type: Type.STRING, description: "Optional: limit to a course by (partial) title" },
      },
      required: ["query"],
    },
  },
  {
    name: "my_training_status",
    description: "The employee's assigned courses with status, due dates, compliance state and progress. Use for 'what is due', 'what do I have to finish', 'how far am I'.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "escalate_to_hr",
    description: "Offer to hand the conversation to a person on the HR team. The employee must confirm on screen; nothing is shared until they do.",
    parameters: {
      type: Type.OBJECT,
      properties: { reason: { type: Type.STRING, description: "One sentence on why a person is needed" } },
      required: ["reason"],
    },
  },
];

export type AssistantContext = { firstName: string; jobTitle: string | null; storeName: string | null; status: TrainingStatus };

/** Per-session learner context — first name and role only, never ids or email (FR-13.2). */
export async function assistantContextFor(user: { id: string; name: string; jobTitle: string | null; storeId: string | null }): Promise<AssistantContext> {
  const [store] = user.storeId ? await db.select({ name: t.orgUnits.name }).from(t.orgUnits).where(eq(t.orgUnits.id, user.storeId)).limit(1) : [];
  return { firstName: user.name.split(" ")[0] || "there", jobTitle: user.jobTitle, storeName: store?.name ?? null, status: await trainingStatus(user.id) };
}

export function buildHrLiveConfig(opts: { voice?: string; resumeHandle?: string; context?: AssistantContext } = {}): LiveConnectConfig {
  const system = opts.context
    ? `${HR_VOICE_SYSTEM}\n\nLEARNER CONTEXT\n${learnerContextLines({ ...opts.context, today: localDate() })}`
    : HR_VOICE_SYSTEM;
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: system,
    tools: [{ functionDeclarations: HR_TOOLS }],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice ?? LIVE_VOICE } } },
    inputAudioTranscription: { languageCodes: [LIVE_LANGUAGE] },
    outputAudioTranscription: {},
    // Snappier end-of-turn for a conversational assistant (the interviewer keeps the defaults).
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 100,
        silenceDurationMs: 500,
      },
    },
    sessionResumption: opts.resumeHandle ? { handle: opts.resumeHandle } : {},
  };
}

export type HrToolResult = {
  /** Sent back to the model verbatim (must be a JSON object). */
  response: Record<string, unknown>;
  /** Citations for the caption chips / stored assistant turn. */
  citations?: LiveCitation[];
  /** Mock mode only: the answer the typed transport shows and speaks. */
  spoken?: string;
};

function uniqueCitations(citations: Array<LiveCitation | null>): LiveCitation[] {
  const seen = new Set<string>();
  const out: LiveCitation[] = [];
  for (const c of citations) {
    if (!c) continue;
    const key = c.kind === "lesson" ? `lesson:${c.lessonId}` : `${c.docId}::${c.sectionPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Audit rows are written after the response is sent (FR-8.11 still holds; the model is not kept waiting). */
function deferred(fn: () => Promise<void>): void {
  try {
    after(fn);
  } catch {
    void fn();
  }
}

export async function runHrTool(opts: {
  user: { id: string; storeId: string | null; role: string };
  conversationId: string;
  name: string;
  args: Record<string, unknown>;
  mock: boolean;
}): Promise<HrToolResult> {
  if (opts.name === "escalate_to_hr") {
    return {
      response: {
        needs_confirmation: true,
        instruction:
          "A confirmation card is now on the employee's screen. Tell them to tap 'Share and create ticket' if they want the HR team to see this conversation. Do not say a ticket was sent.",
      },
    };
  }

  if (opts.name === "my_training_status") {
    const status = await trainingStatus(opts.user.id);
    const lines = status.courses.map(
      (c) => `${c.title}: ${c.status}, ${c.compliance}, ${c.pct}% done${c.due ? `, due ${c.due}${c.daysToDue !== null ? ` (${c.daysToDue < 0 ? `${-c.daysToDue} days overdue` : `${c.daysToDue} days left`})` : ""}` : ""}`,
    );
    return {
      response: { ...status, instruction: "Summarise in one or two spoken sentences: what is overdue or due soonest first, then what is left. Offer to open the course if they ask." },
      spoken: opts.mock ? [status.summary, ...lines].join(" ") : undefined,
    };
  }

  if (opts.name === "search_course_content") {
    const query = String(opts.args.query ?? "").trim().slice(0, 500);
    if (!query) return { response: { found: false, message: "The question was empty — ask the employee to repeat it." } };
    const courseTitle = typeof opts.args.course_title === "string" ? opts.args.course_title : undefined;
    const { excerpts, citations } = await searchCourseContent(opts.user.id, query, courseTitle);
    if (excerpts.length === 0) {
      const message = "I couldn't find that in your assigned courses.";
      return { response: { found: false, message, instruction: "Say you couldn't find it in their courses and ask what they were trying to learn." }, spoken: message };
    }
    const spoken = opts.mock ? `From ${excerpts[0].course} — ${excerpts[0].lesson}: ${excerpts[0].text.slice(0, 350)}` : undefined;
    return {
      response: { found: true, excerpts, instruction: "Answer in one or two short sentences from these excerpts only, naming the course or lesson. Do not read links aloud." },
      citations,
      spoken,
    };
  }

  if (opts.name !== "search_hr_policy") return { response: { error: `Unknown tool ${opts.name}` } };

  const query = String(opts.args.query ?? "").trim().slice(0, 500);
  if (!query) return { response: { found: false, message: "The question was empty — ask the employee to repeat it." } };

  const language = detectLanguage(query);
  const { text: safeQuery, redacted } = redactPii(query);
  const base = { userId: opts.user.id, language, query: safeQuery, piiRedacted: redacted };

  // Layer 0 — deterministic guardrails (spec FR-8.8)
  const verdict = screenInput(query);
  if (verdict.action !== "allow") {
    deferred(() => auditHrTurn(base, { guardrail: verdict.topic, answer: verdict.response, escalated: verdict.action === "human" }));
    return {
      response: {
        found: false,
        guardrail: verdict.topic,
        message: verdict.response,
        instruction:
          verdict.action === "human"
            ? "Read the message aloud with care, then offer to connect the employee with a person now."
            : "Read the message aloud, then explain you can only help with company HR policy and their training.",
      },
      spoken: verdict.response,
    };
  }

  // Hard-filtered hybrid retrieval + layer-1 confidence (spec FR-8.5/8.6)
  const scope = await hrScopeFor(opts.user);
  const hits = await searchPolicyChunks(safeQuery, scope, 6);
  if (!retrievalConfident(hits)) {
    deferred(() => auditHrTurn(base, { answer: HR_ABSTENTION, confidence: hits[0]?.score ?? 0, escalated: false }));
    return {
      response: { found: false, message: HR_ABSTENTION, instruction: "Say you couldn't find this in the current policies and offer to connect the employee with the HR team." },
      spoken: HR_ABSTENTION,
    };
  }

  const docs = await docsForHits(hits);
  const excerpts = hits.map((h, i) => ({
    index: i,
    policy: docs.get(h.docId)?.title ?? "Policy",
    section: h.sectionPath,
    text: (h.parentText || h.text).slice(0, 1200),
  }));
  const citations = uniqueCitations(hits.map((h) => toCitation(h, docs))).slice(0, 4);
  const mock = opts.mock ? extractiveAnswer(hits, docs) : null;
  deferred(() =>
    auditHrTurn(base, {
      answer: mock ? mock.answer : "[voice] excerpts served to the live model",
      citations: citations.filter((c): c is Exclude<LiveCitation, { kind: "lesson" }> => c.kind !== "lesson"),
      chunkIds: hits.map((h) => h.id),
      confidence: hits[0].score,
    }),
  );
  return {
    response: {
      found: true,
      excerpts,
      footer: DETERMINATION_FOOTER,
      instruction: "Answer in one or two short sentences using ONLY these excerpts, starting with 'Per the <policy> policy'. Do not read section names aloud.",
    },
    citations,
    spoken: mock?.answer,
  };
}
