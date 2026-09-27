"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isLessonWorkspace } from "@/lib/navigation";

export function LearnerContainer({ children }: { children: ReactNode }) {
  return <div className={isLessonWorkspace(usePathname()) ? "w-full" : "content-container"}>{children}</div>;
}

/** Keeps global navigation out of the focused lesson workspace. */
export function LearnerFrame({ header, lessonHeader, tabs, children }: { header: ReactNode; lessonHeader: ReactNode; tabs: ReactNode; children: ReactNode }) {
  const lesson = isLessonWorkspace(usePathname());
  return <div className="min-h-dvh">
    <a href="#main-content" className="skip-link">Skip to content</a>
    {lesson ? lessonHeader : header}
    <main id="main-content" tabIndex={-1} className={lesson ? "lesson-shell-main" : "learner-main"}><LearnerContainer>{children}</LearnerContainer></main>
    {!lesson ? tabs : null}
  </div>;
}
