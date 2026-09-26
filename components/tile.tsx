import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";
import { Icon } from "./icons";
import { AnimatedNumber } from "./animated-number";
import { ProgressRing } from "./ring";

/* Neutral summary surfaces; status hues carry meaning only. */
const tones = {
  default: { card: "border-border bg-surface", value: "text-foreground", dot: null },
  muted: { card: "border-transparent bg-surface-2", value: "text-muted", dot: null },
  success: { card: "border-border bg-surface", value: "text-foreground", dot: "bg-success" },
  warning: { card: "border-transparent bg-warning-tint", value: "text-foreground", dot: "bg-warning" },
  destructive: { card: "border-border bg-surface", value: "text-destructive-text", dot: "bg-destructive" },
  ai: { card: "border-transparent bg-ai-tint", value: "text-ai-fg", dot: null },
} as const;

/** Compact summary compatible with existing reporting pages. */
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
  const t = tones[tone];
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className={cx("truncate", numeric ? "stat text-2xl" : "display text-lg", t.value)}>
          {numeric ? <AnimatedNumber value={value} suffix={suffix} /> : value}
        </p>
        <p className="mt-1 text-sm flex items-start gap-2 text-muted">
          {t.dot ? <span className={cx("mt-1 size-2 shrink-0 rounded-full", t.dot)} aria-hidden /> : null}
          <span>{label}</span>
        </p>
        {hint ? <p className="mt-1 line-clamp-2 text-xs text-muted">{hint}</p> : null}
      </div>
      {ring !== undefined ? (
        <ProgressRing pct={ring} size={48} />
      ) : href && !disabled ? (
        <span className="nudge flex size-6 shrink-0 items-center justify-center rounded-control bg-surface-2 text-foreground" aria-hidden>
          <Icon name="arrow-right" size={14} />
        </span>
      ) : null}
    </div>
  );
  const classes = cx(
    "block rounded-card border p-4",
    t.card,
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
