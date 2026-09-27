import type { LiveConnection, LiveEvent } from "./session";
import type { Citation, LiveKind } from "../shared";

/**
 * Offline demo transport (spec FR-14.6): the same event surface as a Live
 * session, driven by typed text. HR answers come from the real retrieval tool;
 * interview grading uses the server's offline grader. Speaks with the
 * browser's speech synthesis when available.
 */

type PostEvent = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;

const HR_GREETING =
  "Hi — I'm your xprtn assistant, running in offline demo mode. Type a question about HR policy (leave, pay, hours), about your assigned courses, or ask what training is due.";

const STATUS_RE = /\b(my training|training (is )?due|what('s| is) due|due for me|assigned|overdue|my courses?|which courses?|how far|my progress|what do i (have|need) to (finish|complete))\b/i;
const COURSE_RE = /\b(lesson|course|module|video|cold chain|greet|greeting|handwash|hand hygiene|till|refund|allergen|alarm|assembly|customer|complaint|fridge|temperature)\b/i;

/** Offline routing stands in for the model's tool choice. */
export function routeMockTool(text: string): { name: string; args: Record<string, unknown> } {
  if (STATUS_RE.test(text)) return { name: "my_training_status", args: {} };
  if (COURSE_RE.test(text)) return { name: "search_course_content", args: { query: text } };
  return { name: "search_hr_policy", args: { query: text } };
}

function speak(text: string, onEvent: (e: LiveEvent) => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#]/g, ""));
    u.lang = "en-GB";
    u.rate = 1;
    u.onstart = () => onEvent({ type: "speaking", value: true });
    u.onend = () => onEvent({ type: "speaking", value: false });
    u.onerror = () => onEvent({ type: "speaking", value: false });
    window.speechSynthesis.speak(u);
  } catch {
    /* synthesis unavailable */
  }
}

export function createMockTransport(opts: {
  kind: LiveKind;
  questions?: string[];
  postEvent: PostEvent;
  onEvent: (event: LiveEvent) => void;
}): LiveConnection & { start(): void } {
  const { onEvent } = opts;
  const questions = opts.questions ?? [];
  const qa: Array<{ question: string; answer: string }> = [];
  let index = 0;
  let busy = false;
  let closed = false;

  const say = (text: string, citations?: Citation[]) => {
    onEvent({ type: "output", text });
    if (citations?.length) onEvent({ type: "citations", citations });
    onEvent({ type: "turnComplete" });
    speak(text, onEvent);
  };

  const askNext = () => {
    if (index < questions.length) {
      say(`Question ${index + 1} of ${questions.length}. ${questions[index]}`);
    }
  };

  const finish = async () => {
    say("Thank you — that's the end of the check. Grading now…");
    try {
      const res = await opts.postEvent({ type: "mock_evaluate", qa });
      onEvent({ type: "result", result: res });
      say("Your result is on screen now. Well done for taking the check.");
    } catch (err) {
      onEvent({ type: "error", message: err instanceof Error ? err.message : "Grading failed" });
    }
    closed = true;
    onEvent({ type: "close", code: 1000, reason: "demo complete" });
  };

  return {
    start() {
      onEvent({ type: "open" });
      if (opts.kind === "hr") {
        say(HR_GREETING);
      } else {
        say(`Hi! I'm your AI oral-check interviewer, in offline demo mode. I'll ask ${questions.length} short questions about the lesson — type your answers.`);
        askNext();
      }
    },
    sendAudio() {
      /* typed-only in demo mode */
    },
    endAudio() {},
    sendText(text) {
      if (closed || busy || !text.trim()) return;
      onEvent({ type: "input", text });
      onEvent({ type: "turnComplete" });
      if (opts.kind === "hr") {
        busy = true;
        const route = routeMockTool(text);
        void opts
          .postEvent({ type: "tool", name: route.name, args: route.args })
          .then((res) => {
            const spoken = typeof res.spoken === "string" ? res.spoken : "I couldn't find this in the current policies.";
            say(spoken, Array.isArray(res.citations) ? (res.citations as Citation[]) : undefined);
          })
          .catch((err: unknown) => onEvent({ type: "error", message: err instanceof Error ? err.message : "Lookup failed" }))
          .finally(() => {
            busy = false;
          });
        return;
      }
      qa.push({ question: questions[index] ?? "(question)", answer: text });
      index += 1;
      if (index >= questions.length) {
        busy = true;
        void finish();
      } else {
        askNext();
      }
    },
    close() {
      closed = true;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
  };
}
