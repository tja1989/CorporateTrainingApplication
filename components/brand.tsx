import Link from "next/link";

/** The wordmark: display face, with the accent full stop that recurs on the active nav row. */
export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={["display inline-flex items-baseline whitespace-nowrap text-lg leading-none", className].filter(Boolean).join(" ")}>
      LuLu Learn<span className="text-accent">.</span>
    </Link>
  );
}
