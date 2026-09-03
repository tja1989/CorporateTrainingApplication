import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { loadEnv } from "@/lib/env";

/**
 * Extra demo lesson content, added idempotently by title.
 *
 * Two reasons this exists rather than living in `seed.ts`: an already-seeded
 * demo database never re-runs the seed, and the demo needs every lesson type
 * reachable inside one course — including a PDF, so the in-app document viewer
 * can be shown. Adds lessons to an existing module, so the trailing "Oral
 * check" module keeps its position.
 */

type ExtraLesson =
  | { type: "TEXT"; title: string; body: string }
  | { type: "PDF"; title: string; fileUrl: string };

const EXTRA_CONTENT: Array<{ course: string; module: string; lessons: ExtraLesson[] }> = [
  {
    course: "Food Safety Essentials",
    module: "Personal hygiene",
    lessons: [
      {
        type: "TEXT",
        title: "Gloves, aprons and hair",
        body:
          "# Dress for the section\n\nWhat you wear is part of the barrier between you and the food.\n\n" +
          "- **Gloves are not a substitute for washing.** Change them as often as you would wash your hands, and always between raw and ready-to-eat\n" +
          "- **Aprons stay in the section.** Take yours off before the staff room, the toilet or the loading bay — and never hang it over a bin\n" +
          "- **Hair fully covered**, beard snood where your section requires one\n" +
          "- **No watch and no stone rings.** A plain band is fine; nothing that can trap food or fall in\n\n" +
          "## Cuts and plasters\n\nCover any cut with a **blue detectable plaster** and a glove over it. Blue because no food is blue — if one comes off, it is found.",
      },
      {
        type: "TEXT",
        title: "When you must not handle food",
        body:
          "# Stop and report\n\nSome things mean you do not go near open food today. This is not a judgement — it is the rule, and your team leader will find you other work.\n\n" +
          "- **Vomiting or diarrhoea** in the last **48 hours**\n" +
          "- An **infected** skin, eye, ear, nose or throat condition\n" +
          "- A **confirmed** case of a food-borne illness at home\n\n" +
          "## How to report it\n\nTell your team leader before your shift starts — a message is fine. You will not lose the shift for reporting honestly, " +
          "and the section cannot be cleared safely if nobody knows.\n\n" +
          "Report a **fridge reading warm** the same way, immediately, and move the stock before you finish the message.",
      },
      {
        type: "PDF",
        title: "Personal hygiene card (printable)",
        fileUrl: "/demo/food-safety-hygiene-card.pdf",
      },
    ],
  },
];

export async function ensureDemoContentLessons(): Promise<number> {
  let added = 0;
  for (const spec of EXTRA_CONTENT) {
    const [course] = await db.select().from(t.courses).where(eq(t.courses.title, spec.course)).limit(1);
    if (!course) continue;
    const [mod] = await db
      .select()
      .from(t.modules)
      .where(and(eq(t.modules.courseId, course.id), eq(t.modules.title, spec.module)))
      .limit(1);
    if (!mod) continue;

    const existing = await db.select().from(t.lessons).where(eq(t.lessons.moduleId, mod.id));
    const titles = new Set(existing.map((l) => l.title));
    let sort = existing.reduce((max, l) => Math.max(max, l.sort), -1);

    for (const lesson of spec.lessons) {
      if (titles.has(lesson.title)) continue;
      sort += 1;
      await db.insert(t.lessons).values({
        id: id(),
        moduleId: mod.id,
        type: lesson.type,
        title: lesson.title,
        sort,
        payload: lesson.type === "TEXT" ? { body: lesson.body } : { fileUrl: lesson.fileUrl },
        searchText: lesson.type === "TEXT" ? lesson.body : null,
      });
      added++;
    }
  }
  return added;
}

if (process.argv[1]?.endsWith("seed-content.ts")) {
  loadEnv();
  ensureDemoContentLessons()
    .then((n) => {
      console.log(`seed-content: ${n} lesson(s) added`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
