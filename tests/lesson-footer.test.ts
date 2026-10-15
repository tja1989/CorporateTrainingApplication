import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decorateOutline, type OutlineInputLesson } from "../lib/lms/outline";
import { LessonCompletion, LessonProgressProvider } from "../components/lesson-progress";

const lessons: OutlineInputLesson[] = [
  { id: "l1", moduleId: "m1", type: "TEXT", title: "Handwashing", sort: 0, payload: { body: "word ".repeat(50) } },
  { id: "l2", moduleId: "m1", type: "VIDEO", title: "Cold chain", sort: 1, payload: { videoId: "v1" } },
  { id: "l3", moduleId: "m1", type: "TEXT", title: "Allergens", sort: 2, payload: { body: "word" } },
];
const render = (lessonId: string, done: string[]) => {
  const view = decorateOutline({ courseId: "c1", modules: [{ id: "m1", title: "Hygiene", sort: 0 }], lessons, doneLessonIds: done, sequentialLock: false, currentLessonId: lessonId });
  return renderToStaticMarkup(createElement(LessonProgressProvider, { initialView: view, children: createElement(LessonCompletion, { lessonId }) }));
};
const nextLink = (html: string) => html.match(/<a[^>]*href="\/lesson\/l[23]"[^>]*>Next lesson<\/a>/)?.[0] ?? "";

describe("lesson footer", () => {
  it("keeps Next lesson secondary until the lesson is complete", () => {
    expect(nextLink(render("l1", []))).toContain("bg-surface");
    expect(nextLink(render("l1", []))).not.toContain("bg-primary");
    expect(nextLink(render("l1", ["l1"]))).toContain("bg-primary");
  });
  it("does not repeat the button's instruction in a sentence", () => {
    expect(render("l1", [])).not.toContain("When you have finished, mark this lesson complete.");
    expect(render("l2", [])).toContain("Completes automatically when you finish.");
  });
});
