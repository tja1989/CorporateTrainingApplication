/** Generated course art: a colour field and a subject illustration for courses without a cover image. */
export type CoverSubject = "food" | "fire" | "safety" | "cash" | "service" | "learning";
export type CoverField = 1 | 2 | 3 | 4 | 5 | 6;

// First match wins, so "Food Safety" reads as food and "Fire & Emergency" as fire.
const SUBJECTS: Array<[CoverSubject, RegExp]> = [
  ["fire", /\bfire\b|emergenc|evacuat/],
  ["food", /food|hygien|kitchen|fresh|allergen|cold chain/],
  ["safety", /safety|compliance|security|health/],
  ["cash", /\bpos\b|cash|till|payment|checkout/],
  ["service", /customer|service|team|leader|communicat/],
];

// Each subject keeps one field so colour carries meaning; general courses spread across all six.
const SUBJECT_FIELD: Record<Exclude<CoverSubject, "learning">, CoverField> = { food: 1, service: 2, safety: 3, fire: 4, cash: 5 };

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

export function courseArt(title: string, tags: string[] = []): { field: CoverField; subject: CoverSubject } {
  const text = `${title} ${tags.join(" ")}`.toLowerCase();
  const subject = SUBJECTS.find(([, pattern]) => pattern.test(text))?.[0] ?? "learning";
  const field = subject === "learning" ? ((hash(title.toLowerCase()) % 6) + 1) as CoverField : SUBJECT_FIELD[subject];
  return { field, subject };
}
