"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Every `motion` element honours prefers-reduced-motion: transforms off, opacity fades kept. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
