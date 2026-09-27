"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { flatLessons, lessonNeighbours, type CourseOutlineView } from "@/lib/lms/outline";
import { CourseOutline } from "./course-outline";
import { CompleteLessonForm } from "./complete-lesson";
import { ButtonLink, Chip } from "./ui";

const LessonProgress = createContext<{ view: CourseOutlineView; confirm: (view: CourseOutlineView) => void } | null>(null);

/** Only a server-confirmed outline replaces the initial server snapshot. The
 * player remains mounted while completion actions and contents update together. */
export function LessonProgressProvider({ initialView, children }: { initialView: CourseOutlineView; children: ReactNode }) {
  const [view, setView] = useState(initialView);
  useEffect(() => setView(initialView), [initialView]);
  const confirm = (confirmed: CourseOutlineView) => {
    if (confirmed.courseId === initialView.courseId) setView(confirmed);
  };
  return <LessonProgress.Provider value={{ view, confirm }}>{children}</LessonProgress.Provider>;
}

export function useLessonProgress() { return useContext(LessonProgress); }

export function LiveCourseOutline({ view, variant }: { view: CourseOutlineView; variant: "page" | "rail" }) {
  const current = useLessonProgress();
  return <CourseOutline view={current?.view ?? view} variant={variant} />;
}

export function LessonCompletion({ lessonId }: { lessonId: string }) {
  const current = useLessonProgress();
  if (!current) return null;
  const { view } = current;
  const self = flatLessons(view).find(lesson => lesson.id === lessonId);
  if (!self) return null;
  const { next } = lessonNeighbours(view, lessonId);
  return (
    <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface p-4" aria-label="Lesson completion">
      <div>
        {self.done ? <Chip variant="success">Lesson complete</Chip> : <p className="text-sm text-muted">{self.type === "TEXT" || self.type === "PDF" ? "When you have finished, mark this lesson complete." : "Your progress is recorded as you complete this lesson."}</p>}
        {next?.locked ? <p className="mt-2 text-sm text-muted">Complete this lesson to unlock “{next.title}”.</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {(self.type === "TEXT" || self.type === "PDF") && !self.done ? <CompleteLessonForm lessonId={lessonId} /> : null}
        {self.done && (self.type === "TEXT" || self.type === "VIDEO") ? <ButtonLink variant="secondary" href={`/lesson/${lessonId}/interview`}>Optional oral check</ButtonLink> : null}
        {next && !next.locked ? <ButtonLink href={next.href}>Next lesson</ButtonLink> : !next && self.done ? <ButtonLink href={`/course/${view.courseId}`}>View course completion</ButtonLink> : null}
      </div>
    </section>
  );
}
