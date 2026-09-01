import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";
import { AnimatedNumber } from "./animated-number";
import { ProgressRing } from "./ring";

const tones = {
  default: "text-foreground",
  muted: "text-muted",
  success: "text-success-fg",
  warning: "text-warning-fg",
  destructive: "text-destructive-text",
  ai: "text-ai-fg",
} as const;

/**
 * Bento tile — answers ONE question at a glance and links to where the answer
 * lives. Never a list, never a scroller (spec §10.7 v1.2). Numeric values count
 * up on mount.
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
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className={cx("truncate text-xl font-medium", tones[tone])}>
          {typeof value === "number" ? <AnimatedNumber value={value} suffix={suffix} /> : value}
        </p>
        <p className="text-xs text-muted">{label}</p>
        {hint ? <p className="mt-1 line-clamp-2 text-xs text-muted">{hint}</p> : null}
      </div>
      {ring !== undefined ? <ProgressRing pct={ring} size={44} /> : null}
    </div>
  );
  const classes = cx(
    "block rounded-card border border-border bg-surface p-4",
    href && !disabled && "pressable hover:bg-surface-2",
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
