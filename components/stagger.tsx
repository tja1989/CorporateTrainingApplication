import { Children, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * Staggered entry for rails and lists (spec §10.5): each child fades/slides in
 * 40ms after the previous one, capped at 8 steps. Pure CSS (`.animate-stagger`)
 * so server-rendered content is never hidden waiting for hydration, and
 * reduced-motion collapses to a fade via the global media query.
 */
export function Stagger({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "ol" }) {
  const items = Children.toArray(children);
  return (
    <Tag className={cx(className)}>
      {items.map((child, i) => (
        <div key={(child as { key?: string | null }).key ?? i} className="animate-stagger" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          {child}
        </div>
      ))}
    </Tag>
  );
}
