import type { QuizSettings } from "@/lib/db/schema";

/** Settings a new quiz starts with. Kept free of server imports so the quiz builder can read it. */
export const DEFAULT_SETTINGS: QuizSettings = {
  attemptsLimit: null,
  cooldownMinutes: 0,
  gradingMethod: "highest",
  passPct: 70,
  shuffleQuestions: true,
  shuffleChoices: true,
  oneAtATime: false,
  noBacktrack: false,
  feedbackMode: "PRACTICE",
  graceSec: 30,
  integrityMode: false,
  timeLimitSec: null,
};
