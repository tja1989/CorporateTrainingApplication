import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";
import { Icon } from "./icons";
import { AnimatedNumber } from "./animated-number";
import { ProgressRing } from "./ring";

/* Each tone is a whole card, not just a number colour — the mosaic reads as
   white / mint / sand / pink / lavender at a glance, like a chart legend. */
const tones = {
  default: { card: "border-border bg-surface", value: "text-foreground" },
  muted: { card: "border-transparent bg-surface-2", value: "text-muted" },
  success: { card: "border-transparent bg-success-tint", value: "text-success-fg" },
  warning: { card: "border-transparent bg-warning-tint", value: "text-warning-fg" },
  destructive: { card: "border-transparent bg-destructive-tint", value: "text-destructive-text" },
  ai: { card: "border-transparent bg-ai-tint", value: "text-ai-fg" },
} as const;

/**
 * Bento tile — answers ONE question at a glance and links to where the answer
 * lives. Never a list, never a scroller (spec §10.7 v1.2). Numeric values count
 * up on mount; a linked tile lifts under the pointer and its arrow nudges.
 */
export function Tile({
  label,
  value,
  hint,
  href,
  tone = "default",
  active,
  ring,
  suffix,
  className,
  disabled,
}: {
  label: ReactNode;
  value: ReactNode | number;
  hint?: ReactNode;
  href?: string;
  tone?: keyof typeof tones;
  active?: boolean;
  ring?: number;
  suffix?: string;
  className?: string;
  disabled?: boolean;
}) {
  const numeric = typeof value === "number";
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className={cx("truncate", numeric ? "stat text-2xl" : "display text-lg", tones[tone].value)}>
          {numeric ? <AnimatedNumber value={value} suffix={suffix} /> : value}
        </p>
        <p className="eyebrow mt-1 text-muted">{label}</p>
        {hint ? <p className="mt-1 line-clamp-2 text-xs text-muted">{hint}</p> : null}
      </div>
      {ring !== undefined ? (
        <ProgressRing pct={ring} size={48} />
      ) : href && !disabled ? (
        <span className="nudge flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground" aria-hidden>
          <Icon name="arrow-right" size={14} />
        </span>
      ) : null}
    </div>
  );
  const classes = cx(
    "block rounded-card border p-4",
    tones[tone].card,
    href && !disabled && "lift pressable",
    active && "border-primary",
    disabled && "opacity-60",
    className,
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={classes} aria-current={active ? "true" : undefined}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
