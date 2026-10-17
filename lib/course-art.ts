/** Generated course art: a colour field and a subject illustration for courses without a cover image. */
export type CoverSubject = "food" | "fire" | "safety" | "cash" | "service" | "learning";
export type CoverField = 1 | 2 | 3 | 4 | 5 | 6;
export type CoverPattern = 0 | 1 | 2;

// First match wins, so "Food Safety" reads as food and "Fire & Emergency" as fire.
// Every stem starts at a word boundary, so "Refresher" is not "fresh" and "Steam" is not "team".
const SUBJECTS: Array<[CoverSubject, RegExp]> = [
  ["fire", /\bfire\b|\bemergenc|\bevacuat/],
  ["food", /\bfood|\bhygien|\bkitchen|\bfresh\b|\ballergen|\bcold chain/],
  ["safety", /\bsafety\b|\bcompliance\b|\bsecurity\b|\bhealth\b/],
  ["cash", /\bpos\b|\bcash\b|\btill\b|\bpayments?\b|\bcheckout\b/],
  ["service", /\bcustomer|\bservice\b|\bteams?\b|\bleader|\bcommunicat/],
];

// Each subject keeps one field so colour carries meaning; general courses spread across all six.
const SUBJECT_FIELD: Record<Exclude<CoverSubject, "learning">, CoverField> = { food: 1, service: 2, safety: 3, fire: 4, cash: 5 };

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

/** Subject and colour come from the topic; the background pattern comes from the title, so two food courses still look different. */
export function courseArt(title: string, tags: string[] = []): { field: CoverField; subject: CoverSubject; pattern: CoverPattern } {
  const text = `${title} ${tags.join(" ")}`.toLowerCase();
  const subject = SUBJECTS.find(([, pattern]) => pattern.test(text))?.[0] ?? "learning";
  const h = hash(title.toLowerCase());
  const field = subject === "learning" ? ((h % 6) + 1) as CoverField : SUBJECT_FIELD[subject];
  return { field, subject, pattern: (Math.floor(h / 6) % 3) as CoverPattern };
}
