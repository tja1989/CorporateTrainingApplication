export type QuizSettingsInput = {
  passPct: string;
  attemptsLimit: string;
  timeLimitMinutes: string;
  exam: boolean;
  integrity: boolean;
};
export type QuizSettingsValue = {
  passPct: number;
  attemptsLimit: number | null;
  timeLimitSec: number | null;
  feedbackMode: "PRACTICE" | "EXAM";
  integrityMode: boolean;
};

function whole(raw: string, min: number, max: number): number | null {
  const n = Number(raw);
  return raw.trim() && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Validates the quiz settings an author sets in the quiz builder. */
export function parseQuizSettingsInput(input: QuizSettingsInput): { value: QuizSettingsValue } | { error: string } {
  const passPct = whole(input.passPct, 1, 100);
  if (passPct === null) return { error: "Pass mark must be a whole number from 1 to 100." };
  const attemptsLimit = input.attemptsLimit.trim() ? whole(input.attemptsLimit, 1, 20) : null;
  if (input.attemptsLimit.trim() && attemptsLimit === null)
    return { error: "Attempts must be from 1 to 20, or blank for unlimited." };
  const minutes = input.timeLimitMinutes.trim() ? whole(input.timeLimitMinutes, 1, 180) : null;
  if (input.timeLimitMinutes.trim() && minutes === null)
    return { error: "Time limit must be from 1 to 180 minutes, or blank for none." };
  return {
    value: {
      passPct,
      attemptsLimit,
      timeLimitSec: minutes === null ? null : minutes * 60,
      feedbackMode: input.exam ? "EXAM" : "PRACTICE",
      integrityMode: input.integrity,
    },
  };
}
