import type { QuizSettings } from "@/lib/db/schema";

/** The rules shown before a quiz, matching the quiz page: time includes any accommodation, attempts are what is left. */
export function quizIntroFigures(
  settings: Pick<QuizSettings, "timeLimitSec" | "attemptsLimit" | "passPct">,
  timeMultiplier: number,
  attemptsUsed: number,
): Array<[string, string]> {
  const time = settings.timeLimitSec ? `${Math.round((settings.timeLimitSec * (timeMultiplier || 1)) / 60)} min` : "None";
  const attempts =
    settings.attemptsLimit === null ? "Unlimited" : `${Math.max(0, settings.attemptsLimit - attemptsUsed)} of ${settings.attemptsLimit}`;
  return [["Time limit", time], ["Attempts left", attempts], ["Pass mark", `${settings.passPct}%`]];
}
