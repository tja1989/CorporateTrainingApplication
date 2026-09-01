import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
export { cx };

/* ----------------------------- Buttons ----------------------------- */

const buttonBase =
  "pressable touch-target inline-flex items-center justify-center gap-2 rounded-[--radius-control] px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none";
const buttonVariants = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "bg-surface border border-border text-foreground hover:bg-surface-2",
  ghost: "text-foreground hover:bg-surface-2",
  destructive: "bg-destructive text-destructive-fg hover:opacity-90",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants }) {
  return <button className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonVariants }) {
  return <Link className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

/* ------------------------------ Cards ------------------------------ */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-[--radius-card] border border-border bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.06)]", className)}
      {...props}
    />
  );
}

/* ------------------------------ Chips ------------------------------ */

const chipVariants = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success-tint text-success-fg",
  warning: "bg-warning-tint text-warning-fg",
  destructive: "bg-destructive-tint text-destructive-text",
  ai: "bg-ai-tint text-ai-fg",
  primary: "bg-primary text-primary-fg",
} as const;

export function Chip({
  variant = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { variant?: keyof typeof chipVariants }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", chipVariants[variant], className)}
      {...props}
    />
  );
}

export function complianceChip(status: string): { label: string; variant: keyof typeof chipVariants } {
  switch (status) {
    case "OVERDUE": return { label: "Overdue", variant: "destructive" };
    case "DUE_SOON": return { label: "Due soon", variant: "warning" };
    case "COMPLETED": return { label: "Completed", variant: "success" };
    case "COMPLETED_EXPIRING": return { label: "Expiring", variant: "warning" };
    case "EXPIRED": return { label: "Expired", variant: "destructive" };
    case "WITHDRAWN": return { label: "Withdrawn", variant: "neutral" };
    default: return { label: "On track", variant: "neutral" };
  }
}

/* ------------------------------ Forms ------------------------------ */

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-[--radius-control] border border-border bg-surface px-3.5 py-2.5 text-base placeholder:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx(
        "w-full rounded-[--radius-control] border border-border bg-surface px-3.5 py-2.5 text-base placeholder:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx("w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2.5 text-base", className)}
      {...props}
    />
  );
}

export function Label({ className, children, ...props }: ComponentProps<"label">) {
  return (
    <label className={cx("mb-1.5 block text-sm font-medium text-foreground", className)} {...props}>
      {children}
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/* --------------------------- Empty states --------------------------- */

export function EmptyState({ icon, title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="animate-enter flex flex-col items-center justify-center gap-2 rounded-[--radius-card] border border-dashed border-border px-6 py-12 text-center">
      {icon ? <div className="text-3xl" aria-hidden>{icon}</div> : null}
      <h3 className="font-medium">{title}</h3>
      {body ? <p className="max-w-sm text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

/* --------------------------- Progress ring -------------------------- */

export function ProgressRing({ pct, size = 44, label }: { pct: number; size?: number; label?: string }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(clamped)}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        className="ring-progress"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (clamped / 100) * c}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontSize={size * 0.26} fill="var(--foreground)" fontWeight={600}>
        {Math.round(clamped)}
      </text>
    </svg>
  );
}

/* ------------------------------ Page bits ---------------------------- */

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-ai-voice text-2xl font-semibold">{children}</h1>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}

export function DemoBanner() {
  if (process.env.DEMO_MODE !== "true") return null;
  return (
    <div className="mb-4 rounded-[--radius-control] bg-warning-tint px-3 py-2 text-xs font-medium text-warning-fg">
      DEMO environment — fictional Demo Retail Co. data. Replace with reviewed content before production use.
    </div>
  );
}
