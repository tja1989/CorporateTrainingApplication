import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { loadEnv } from "@/lib/env";

/**
 * Demo oral-check lessons (spec FR-14.2 v1.4). Idempotent: each seeded demo
 * course gets one INTERVIEW lesson in a final "Oral check" module, once.
 * Runs from seed.ts and from deploy-init on every DEMO_MODE boot.
 */
export const DEMO_INTERVIEW_COURSES: Record<string, { focus: string; scope: "course" | "module" }> = {
  "Customer Service Basics": { focus: "the 10-second greeting rule and the LAST complaint method", scope: "course" },
  "Food Safety Essentials": { focus: "handwashing steps and cold-chain temperatures", scope: "course" },
  "Fire & Emergency": { focus: "what to do in the first three minutes of an alarm", scope: "course" },
  "POS & Cash Handling": { focus: "till opening and closing, and the refund rules", scope: "course" },
};

export async function ensureDemoInterviewLessons(): Promise<number> {
  const courses = await db.select().from(t.courses).where(inArray(t.courses.title, Object.keys(DEMO_INTERVIEW_COURSES)));
  let added = 0;
  for (const course of courses) {
    const mods = await db.select().from(t.modules).where(eq(t.modules.courseId, course.id));
    const modIds = mods.map((m) => m.id);
    const existing = modIds.length
      ? await db.select({ id: t.lessons.id }).from(t.lessons).where(and(inArray(t.lessons.moduleId, modIds), eq(t.lessons.type, "INTERVIEW")))
      : [];
    if (existing.length > 0) continue;
    const spec = DEMO_INTERVIEW_COURSES[course.title];
    const moduleId = id();
    await db.insert(t.modules).values({ id: moduleId, courseId: course.id, title: "Oral check", sort: mods.length });
    await db.insert(t.lessons).values({
      id: id(),
      moduleId,
      type: "INTERVIEW",
      title: "Oral check: show what you learned",
      sort: 0,
      payload: { interview: { questionCount: 3, passPct: 67, maxMinutes: 6, scope: spec.scope, focus: spec.focus, requirePass: true } },
    });
    added++;
  }
  return added;
}

if (process.argv[1]?.endsWith("seed-interviews.ts")) {
  loadEnv();
  ensureDemoInterviewLessons()
    .then((n) => {
      console.log(`seed-interviews: ${n} oral-check lesson(s) added`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
