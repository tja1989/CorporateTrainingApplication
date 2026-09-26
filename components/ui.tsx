import Link from "next/link";
import { cloneElement, isValidElement, useId, type ComponentProps, type ReactNode } from "react";
import { Icon, IconDisc, type IconName } from "./icons";

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
export { Icon, IconDisc } from "./icons";
export type { IconName } from "./icons";

/* ----------------------------- Buttons ----------------------------- */

/* 44px primary and secondary controls; pills are reserved for status tags. */
const buttonBase =
  "pressable touch-target inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";
const buttonVariants = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  accent: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary: "bg-surface border border-border text-foreground hover:border-foreground hover:bg-surface-2",
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

/** Native document navigation for GET-filtered views and browser history. */
export function ButtonAnchor({ variant = "primary", className, ...props }: ComponentProps<"a"> & { variant?: keyof typeof buttonVariants }) {
  return <a className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

/* Compatibility names for compact actions; they use the shared control shape. */
const pillBase =
  "pressable touch-target inline-flex items-center justify-center gap-2 rounded-control border px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";
/* Idle and active are mutually exclusive, never layered: Tailwind resolves two
   competing `bg-*` utilities by stylesheet order, not by class order, so an
   active pill that kept the idle background rendered its own text invisible. */
const pillIdle = "border-border bg-surface text-muted hover:border-foreground hover:text-foreground";
const pillActive = "border-primary bg-primary text-primary-fg hover:opacity-90";

export function PillButton({ active, className, ...props }: ComponentProps<"button"> & { active?: boolean }) {
  return <button className={cx(pillBase, active ? pillActive : pillIdle, className)} {...props} />;
}

export function PillLink({ active, className, ...props }: ComponentProps<typeof Link> & { active?: boolean }) {
  return <Link className={cx(pillBase, active ? pillActive : pillIdle, className)} {...props} />;
}

/* ------------------------------ Cards ------------------------------ */

/** Elevation L1: surface + hairline. A shadow only appears under a hovered `.lift` card. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-card border border-border bg-surface", className)} {...props} />;
}

/* ------------------------------ Chips ------------------------------ */

/* Status chips carry a legend dot in their own colour (`.chip-dot`). */
const chipVariants = {
  neutral: "bg-surface-2 text-muted",
  success: "chip-dot bg-success-tint text-success-fg",
  warning: "chip-dot bg-warning-tint text-warning-fg",
  destructive: "chip-dot bg-destructive-tint text-destructive-text",
  ai: "bg-ai-tint text-ai-fg",
  primary: "bg-primary text-primary-fg",
  accent: "bg-accent text-accent-fg",
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

const fieldBase =
  "touch-target w-full rounded-input border border-control-border bg-surface px-3 py-2 text-base placeholder:text-muted transition-colors hover:border-muted focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed aria-invalid:border-destructive";

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

/* min-w-0 so a field laid out in a grid or flex row may shrink past its
   content's intrinsic width — a <select> is as wide as its longest option, and
   without this it widens the whole page rather than the control. */
export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  const generatedId = useId();
  const child = isValidElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>(children) ? children : null;
  const id = child?.props.id ?? generatedId;
  const description = [child?.props["aria-describedby"], hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return <div className="mb-4 min-w-0">
    <Label htmlFor={id}>{label}</Label>
    {child ? cloneElement(child, { id, "aria-describedby": description || undefined, "aria-invalid": error ? true : child.props["aria-invalid"] }) : children}
    {hint ? <p id={`${id}-hint`} className="mt-2 break-words text-sm text-muted">{hint}</p> : null}
    {error ? <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-destructive-text">{error}</p> : null}
  </div>;
}

/* --------------------------- Empty states --------------------------- */

export function EmptyState({
  icon,
  tone = "neutral",
  title,
  body,
  action,
}: {
  icon?: IconName;
  tone?: ComponentProps<typeof IconDisc>["tone"];
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-border bg-surface px-6 py-12 text-center">
      {icon ? <IconDisc name={icon} tone={tone} size={56} className="mb-2" /> : null}
      <h3 className="display text-lg">{title}</h3>
      {body ? <p className="max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className, delayed }: { className?: string; delayed?: boolean }) {
  return <div className={cx(delayed ? "skeleton-delayed" : "skeleton", className)} aria-hidden />;
}

/* ------------------------------ Page bits ---------------------------- */

/** Page header: title (24px, 32px from md), optional sub line and an actions slot. */
export function PageHeader({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-xl md:text-3xl">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Back-compat alias for existing call sites. */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return <PageHeader title={children} sub={sub} />;
}

/** Section heading with clear hierarchy below the page title. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("mb-3 text-lg font-semibold text-foreground", className)}>{children}</h2>;
}

export function DemoBanner() {
  if (process.env.DEMO_MODE !== "true") return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-input bg-warning-tint px-3 py-2 text-xs font-medium text-warning-fg">
      <Icon name="warning" size={14} className="shrink-0" />
      DEMO environment — fictional Demo Retail Co. data. Replace with reviewed content before production use.
    </div>
  );
}
