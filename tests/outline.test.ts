import { describe, expect, it } from "vitest";
import {
  decorateOutline,
  lessonMinutes,
  oralBadge,
  readingMinutes,
  lessonNeighbours,
  sumMinutes,
  type OutlineInputLesson,
  type OutlineInputModule,
} from "../lib/lms/outline";

/* Fixtures: one course, three modules, every lesson type represented. */

const modules: OutlineInputModule[] = [
  { id: "m1", title: "Personal hygiene", sort: 0 },
  { id: "m2", title: "Watch and learn", sort: 1 },
  { id: "m3", title: "Check your knowledge", sort: 2 },
];

const lessons: OutlineInputLesson[] = [
  { id: "l1", moduleId: "m1", type: "TEXT", title: "Handwashing", sort: 0, payload: { body: "word ".repeat(400) } },
  { id: "l2", moduleId: "m1", type: "PDF", title: "Printable guide", sort: 1, payload: { fileUrl: "/g.pdf" } },
  { id: "l3", moduleId: "m2", type: "VIDEO", title: "Cold chain", sort: 0, payload: { videoId: "v1" } },
  { id: "l4", moduleId: "m3", type: "QUIZ", title: "Final check", sort: 0, payload: { quizId: "q1" } },
  { id: "l5", moduleId: "m3", type: "INTERVIEW", title: "Oral check", sort: 1, payload: { interview: { questionCount: 4, passPct: 60, maxMinutes: 6, scope: "course", requirePass: false } } },
];

const videoSec = new Map([["v1", 540]]);
const quizSec = new Map([["q1", 600]]);

function build(over: Partial<Parameters<typeof decorateOutline>[0]> = {}) {
  return decorateOutline({ courseId: "c1", modules, lessons, doneLessonIds: [], sequentialLock: false, videoSec, quizSec, ...over });
}

describe("lessonMinutes", () => {
  it("reads a video's real duration, rounded to the minute", () => {
    expect(lessonMinutes({ type: "VIDEO", payload: { videoId: "v1" } }, { videoSec: 540 })).toBe(9);
    expect(lessonMinutes({ type: "VIDEO", payload: { videoId: "v1" } }, { videoSec: 20 })).toBe(1);
  });

  it("estimates reading time for text at 200 wpm", () => {
    expect(readingMinutes("word ".repeat(400))).toBe(2);
    expect(readingMinutes("short")).toBe(1);
    expect(readingMinutes("   ")).toBeNull();
    expect(readingMinutes(undefined)).toBeNull();
  });

  it("takes a quiz's time limit and an oral check's time box", () => {
    expect(lessonMinutes({ type: "QUIZ", payload: { quizId: "q1" } }, { quizSec: 600 })).toBe(10);
    expect(lessonMinutes({ type: "INTERVIEW", payload: { interview: { questionCount: 4, passPct: 60, maxMinutes: 6, scope: "course", requirePass: false } } }, {})).toBe(6);
  });

  it("returns null rather than guessing when nothing is stored", () => {
    expect(lessonMinutes({ type: "PDF", payload: { fileUrl: "/g.pdf" } }, {})).toBeNull();
    expect(lessonMinutes({ type: "QUIZ", payload: { quizId: "q1" } }, { quizSec: null })).toBeNull();
    expect(lessonMinutes({ type: "VIDEO", payload: {} }, {})).toBeNull();
  });
});

describe("sumMinutes", () => {
  it("adds what it knows and flags what it doesn't", () => {
    expect(sumMinutes([2, 3])).toEqual({ minutes: 5, partial: false });
    expect(sumMinutes([2, null])).toEqual({ minutes: 2, partial: true });
    expect(sumMinutes([null, null])).toEqual({ minutes: null, partial: true });
    expect(sumMinutes([])).toEqual({ minutes: null, partial: false });
  });
});

describe("decorateOutline — shape and roll-ups", () => {
  it("orders modules and lessons by sort", () => {
    const shuffled = decorateOutline({
      courseId: "c1",
      modules: [...modules].reverse(),
      lessons: [...lessons].reverse(),
      doneLessonIds: [],
      sequentialLock: false,
      videoSec,
      quizSec,
    });
    expect(shuffled.modules.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(shuffled.modules[0].lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("marks a module partial when one of its lessons has no estimate", () => {
    const view = build();
    const [hygiene, video, check] = view.modules;
    expect(hygiene.minutes).toBe(2); // the text lesson; the PDF contributes nothing
    expect(hygiene.minutesPartial).toBe(true);
    expect(video.minutes).toBe(9);
    expect(video.minutesPartial).toBe(false);
    expect(check.minutes).toBe(16);
  });

  it("counts progress and the time still to do", () => {
    const view = build({ doneLessonIds: ["l1", "l2"] });
    expect(view.doneCount).toBe(2);
    expect(view.total).toBe(5);
    expect(view.pct).toBe(40);
    expect(view.minutesLeft).toBe(25); // 9 video + 10 quiz + 6 oral
    expect(view.minutesLeftPartial).toBe(false);
    expect(view.modules[0].complete).toBe(true);
  });

  it("points at the first unfinished lesson in flat order", () => {
    expect(build().nextLessonId).toBe("l1");
    expect(build({ doneLessonIds: ["l1", "l2", "l3"] }).nextLessonId).toBe("l4");
    expect(build({ doneLessonIds: lessons.map((l) => l.id) }).nextLessonId).toBeNull();
  });
});

describe("decorateOutline — lesson state", () => {
  it("locks nothing when the course is not sequential", () => {
    const view = build({ sequentialLock: false });
    expect(view.modules.flatMap((m) => m.lessons).some((l) => l.locked)).toBe(false);
  });

  it("locks every lesson after the first gap, across module boundaries", () => {
    const view = build({ sequentialLock: true, doneLessonIds: ["l1"] });
    const state = Object.fromEntries(view.modules.flatMap((m) => m.lessons).map((l) => [l.id, l.locked]));
    expect(state).toEqual({ l1: false, l2: false, l3: true, l4: true, l5: true });
  });

  it("unlocks the next lesson once the gap closes", () => {
    const view = build({ sequentialLock: true, doneLessonIds: ["l1", "l2"] });
    const state = Object.fromEntries(view.modules.flatMap((m) => m.lessons).map((l) => [l.id, l.locked]));
    expect(state).toEqual({ l1: false, l2: false, l3: false, l4: true, l5: true });
  });

  it("keeps the type readable and lets current win over done", () => {
    const view = build({ doneLessonIds: ["l1"], currentLessonId: "l1" });
    const l1 = view.modules[0].lessons[0];
    expect(l1.type).toBe("TEXT"); // the type is never overwritten by a completion mark
    expect(l1.done).toBe(true);
    expect(l1.current).toBe(true);
    expect(l1.state).toBe("current");
  });
});

describe("oralBadge", () => {
  it("offers an oral check on a finished video or article", () => {
    expect(oralBadge("TEXT", true, undefined, "l1")).toEqual({ label: "Oral check", variant: "ai", href: "/lesson/l1/interview" });
    expect(oralBadge("TEXT", false, undefined, "l1")).toBeNull();
    expect(oralBadge("PDF", true, undefined, "l2")).toBeNull();
  });

  it("shows the score once a check is complete", () => {
    expect(oralBadge("VIDEO", true, { state: "COMPLETED", outcome: "PASS", scorePct: 80 }, "l3"))
      .toEqual({ label: "Oral check · 80%", variant: "success", href: "/lesson/l3/interview" });
    expect(oralBadge("VIDEO", true, { state: "COMPLETED", outcome: "FAIL", scorePct: 40 }, "l3"))
      .toEqual({ label: "Oral check · not passed (40%)", variant: "warning", href: "/lesson/l3/interview" });
  });

  it("reports an interview lesson's own result, with no retake link", () => {
    expect(oralBadge("INTERVIEW", true, { state: "COMPLETED", outcome: "PASS", scorePct: 75 }, "l5"))
      .toEqual({ label: "Passed · 75%", variant: "success" });
    expect(oralBadge("INTERVIEW", false, { state: "RUNNING", outcome: null, scorePct: null }, "l5")).toBeNull();
  });
});

describe("decorateOutline — which modules arrive open", () => {
  it("folds away finished sections on the course page", () => {
    const view = build({ doneLessonIds: ["l1", "l2"] });
    expect(view.modules.map((m) => m.open)).toEqual([false, true, true]);
  });

  it("opens only the current lesson's module on a lesson page", () => {
    const view = build({ currentLessonId: "l4" });
    expect(view.modules.map((m) => m.open)).toEqual([false, false, true]);
  });

  it("honours expand-all over both defaults", () => {
    expect(build({ expandAll: true, doneLessonIds: ["l1", "l2"] }).modules.every((m) => m.open)).toBe(true);
    expect(build({ expandAll: true, currentLessonId: "l4" }).modules.every((m) => m.open)).toBe(true);
  });

  it("leaves a finished course with its first section open, not a wall of bars", () => {
    const view = build({ doneLessonIds: lessons.map((l) => l.id) });
    expect(view.modules.map((m) => m.open)).toEqual([true, false, false]);
  });
});

describe("lessonNeighbours", () => {
  it("walks the flat sequence across module boundaries", () => {
    const view = build();
    const at = lessonNeighbours(view, "l3");
    expect(at.index).toBe(2);
    expect(at.total).toBe(5);
    expect(at.prev?.id).toBe("l2");
    expect(at.next?.id).toBe("l4");
    expect(lessonNeighbours(view, "l1").prev).toBeNull();
    expect(lessonNeighbours(view, "l5").next).toBeNull();
  });

  it("reports a locked next lesson so the footer can say so instead of linking into a dead end", () => {
    const open = lessonNeighbours(build({ sequentialLock: true, doneLessonIds: ["l1", "l2"] }), "l3");
    expect(open.next?.locked).toBe(true);
    const cleared = lessonNeighbours(build({ sequentialLock: true, doneLessonIds: ["l1", "l2", "l3"] }), "l3");
    expect(cleared.next?.locked).toBe(false);
  });
});
