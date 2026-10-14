import type { ReactNode } from "react";
import { cx } from "./ui";
import { Icon } from "./icons";

/**
 * The AI surface — the honesty affordance for genuinely model-generated text
 * (spec §10.2 v1.2). A tinted `--ai` surface with a small "AI" label; the
 * surface, not a typeface, marks the content as generated. Never used for
 * rule-based or human-authored UI.
 */
export function AiSurface({
  variant = "bubble",
  mock,
  children,
  className,
  label = "AI",
}: {
  variant?: "bubble" | "block";
  mock?: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-card bg-ai-tint px-3 py-2 text-sm text-foreground",
        variant === "bubble" && "inline-block max-w-[92%] text-start",
        variant === "block" && "w-full",
        className,
      )}
    >
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-ai-fg">
        <Icon name="sparkle" size={14} />
        <span>{label}</span>
      </span>
      {children}
      {mock ? <span className="mt-1 block text-xs text-muted">offline demo mode</span> : null}
    </div>
  );
}
