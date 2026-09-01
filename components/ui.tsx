import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
export { cx };

/* Re-exported primitives (own files so client/server boundaries stay clean) */
export { ProgressRing } from "./ring";
export { Tile } from "./tile";
export { AnimatedNumber } from "./animated-number";
export { Stagger } from "./stagger";
export { AiSurface } from "./ai-surface";

/* ----------------------------- Buttons ----------------------------- */

const buttonBase =
  "pressable touch-target inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none";
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

/* Pill — a 24px secondary action (suggestions, scope toggles, quick actions).
   `.hit-area` extends the tap target to 44px without inflating the pill. */
const pillBase =
  "pressable hit-area inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted hover:bg-surface-2 disabled:opacity-50 disabled:pointer-events-none";

export function PillButton({ active, className, ...props }: ComponentProps<"button"> & { active?: boolean }) {
  return <button className={cx(pillBase, active && "border-primary text-foreground", className)} {...props} />;
}

export function PillLink({ active, className, ...props }: ComponentProps<typeof Link> & { active?: boolean }) {
  return <Link className={cx(pillBase, active && "border-primary bg-primary text-primary-fg hover:opacity-90", className)} {...props} />;
}

/* ------------------------------ Cards ------------------------------ */

/** Elevation L1: surface + hairline. Never a shadow (spec §10.4 v1.2). */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-card border border-border bg-surface", className)} {...props} />;
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
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", chipVariants[variant], className)}
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

const fieldBase = "touch-target w-full rounded-input border border-border bg-surface px-3 py-2 text-base placeholder:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, className)} {...props} />;
}

export function Label({ className, children, ...props }: ComponentProps<"label">) {
  return (
    <label className={cx("mb-1 block text-sm font-medium text-foreground", className)} {...props}>
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
    <div className="animate-enter flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border px-6 py-12 text-center">
      {icon ? <div className="text-xl text-muted" aria-hidden>{icon}</div> : null}
      <h3 className="font-medium">{title}</h3>
      {body ? <p className="max-w-sm text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className, delayed }: { className?: string; delayed?: boolean }) {
  return <div className={cx(delayed ? "skeleton-delayed" : "skeleton", className)} aria-hidden />;
}

/* ------------------------------ Page bits ---------------------------- */

/** Page header: 24/500 display title, optional sub line and an actions slot. */
export function PageHeader({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-medium">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Back-compat alias for existing call sites. */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return <PageHeader title={children} sub={sub} />;
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("mb-2 text-sm font-medium text-muted", className)}>{children}</h2>;
}

export function DemoBanner() {
  if (process.env.DEMO_MODE !== "true") return null;
  return (
    <div className="mb-4 rounded-control bg-warning-tint px-3 py-2 text-xs font-medium text-warning-fg">
      DEMO environment — fictional Demo Retail Co. data. Replace with reviewed content before production use.
    </div>
  );
}
