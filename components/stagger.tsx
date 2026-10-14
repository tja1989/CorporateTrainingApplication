import type { ReactNode } from "react";

/** Compatibility wrapper: application lists appear immediately without entry motion. */
export function Stagger({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "ol" }) {
  return <Tag className={className}>{children}</Tag>;
}
