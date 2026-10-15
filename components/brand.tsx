import Link from "next/link";

/** The xprtn monogram: a deep-ink tile with an "x" drawn in white and action blue. */
export function Logomark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="8" fill="#0F2347" />
      <path d="M10.5 10.5 21.5 21.5" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M21.5 10.5 10.5 21.5" stroke="#4C8DFF" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

/** Logomark and lowercase wordmark shared by learning and management workspaces. */
export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={["brand inline-flex items-center gap-2 whitespace-nowrap leading-none touch-target", className].filter(Boolean).join(" ")}>
      <Logomark size={26} />
      xprtn
    </Link>
  );
}
