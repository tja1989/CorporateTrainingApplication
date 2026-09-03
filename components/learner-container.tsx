"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * The learner content measure. It wraps the page content only — never the nav
 * rail — so the rail keeps one position (the viewport's start edge) on every
 * page and only the content's centred width changes. Lesson pages take the
 * wider measure so the course-contents rail can sit beside the lesson without
 * squeezing the video player's tutor column; every other learner surface keeps
 * the narrower reading measure.
 */
export function LearnerContainer({ children }: { children: ReactNode }) {
  const wide = usePathname().startsWith("/lesson/");
  return <div className={cx("mx-auto", wide ? "max-w-7xl" : "max-w-5xl")}>{children}</div>;
}
