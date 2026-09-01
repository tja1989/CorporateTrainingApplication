/**
 * HR-assistant guardrails (spec FR-8.8): denied topics, grievance human-routing,
 * promissory-language output rail, prompt-injection screening. Deterministic
 * layers that run regardless of AI availability.
 */

export type GuardrailVerdict =
  | { action: "allow" }
  | { action: "deny"; topic: string; response: string }
  | { action: "human"; topic: string; response: string };

const GRIEVANCE = /\b(harass|harassment|bully|bullied|bullying|discriminat|assault|abuse|abusive|threatened|threatening|victimis|victimiz|retaliat)\w*\b/i;
const LEGAL = /\b(sue|lawsuit|lawyer|attorney|court case|legal action|legal advice|tribunal)\b/i;
const VISA = /\b(visa (status|ban|cancel|transfer)|immigration ruling|deport|absconding case)\b/i;
const MEDICAL = /\b(diagnos|symptom|medication|prescri|mental health treatment|therapy for)\w*\b/i;
const SALARY_NEG = /\b(negotiate|negotiating|raise my salary|salary increase request|ask for more money|increment request)\b/i;

const INJECTION = /\b(ignore (all|previous|prior|the above) (instructions|rules)|system prompt|you are now|jailbreak|pretend (you are|to be)|developer mode|reveal your (prompt|instructions))\b/i;

export function screenInput(text: string): GuardrailVerdict {
  if (GRIEVANCE.test(text)) {
    return {
      action: "human",
      topic: "grievance",
      response:
        "I'm sorry you're dealing with this — it deserves a person, not a bot. I won't answer this here; I can connect you directly with the HR team, confidentially. Would you like me to open a ticket now? You can also reach HR in person at your store office.",
    };
  }
  if (INJECTION.test(text)) {
    return { action: "deny", topic: "injection", response: "I can only answer questions about company policies. What would you like to know?" };
  }
  if (LEGAL.test(text)) {
    return {
      action: "deny",
      topic: "legal",
      response: "I can't give legal advice. I can explain what company policy says, or you can escalate to HR who can involve the right people.",
    };
  }
  if (VISA.test(text)) {
    return {
      action: "deny",
      topic: "visa",
      response: "Visa and immigration cases are individual — I can't advise on them. Please raise a ticket so the HR team can look at your specific situation.",
    };
  }
  if (MEDICAL.test(text)) {
    return {
      action: "deny",
      topic: "medical",
      response: "I can't help with medical questions. For sick-leave policy I can help; for health concerns please see a medical professional.",
    };
  }
  if (SALARY_NEG.test(text)) {
    return {
      action: "deny",
      topic: "salary_negotiation",
      response: "Salary discussions are between you, your manager, and HR — I can't advise on negotiation. I can explain the pay and allowance policies if that helps.",
    };
  }
  return { action: "allow" };
}

const PROMISSORY = /\b(you (will|shall) (be|get|receive)|is (hereby )?approved|we guarantee|i guarantee|(the company|hr) promises)\b/i;

export const DETERMINATION_FOOTER = "Only the HR team makes final determinations — this is guidance from policy, not a decision.";

/** Output rail: strip promissory phrasing; ensure the determination footer (spec FR-8.4). */
export function applyOutputRail(answer: string): string {
  let out = answer;
  if (PROMISSORY.test(out)) {
    out = out.replace(PROMISSORY, (m) => `per policy, this may ${m.split(" ").slice(-1)[0]}`);
  }
  if (!out.includes("final determinations")) {
    out = `${out.trim()}\n\n_${DETERMINATION_FOOTER}_`;
  }
  return out;
}

/** Evaluated answer languages (spec FR-8.9). English only at MVP launch. */
export const EVALUATED_LANGUAGES = new Set(["en"]);

export function detectLanguage(text: string): string {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (/[ഀ-ൿ]/.test(text)) return "ml";
  if (/[஀-௿]/.test(text)) return "ta";
  // Romanized Hindi/Malayalam heuristic (documented Gulf reality)
  const romanized = /\b(kya|hai|kaise|kitna|chutti|shadi|salana|enik|undo|cheyy|venam|epol|mera|meri|nahi|milega)\b/i;
  if (romanized.test(text)) return "romanized-indic";
  return "en";
}
