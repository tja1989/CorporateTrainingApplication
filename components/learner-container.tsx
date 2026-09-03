"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * The learner content container. Lesson pages take the wider measure so the
 * course-contents rail can sit beside the lesson without squeezing the video
 * player's tutor column: at 1280px this leaves the lesson itself ~776px, within
 * a pixel of the 768px it gets today. Every other learner surface keeps the
 * narrower reading measure.
 */
export function LearnerContainer({ children }: { children: ReactNode }) {
  const wide = usePathname().startsWith("/lesson/");
  return <div className={cx("shell-body mx-auto flex", wide ? "max-w-7xl" : "max-w-5xl")}>{children}</div>;
}
