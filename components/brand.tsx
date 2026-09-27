import Link from "next/link";

/** Lowercase product wordmark. LuLu remains the customer, not the product name. */
export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return <Link href={href} className={["brand inline-flex items-center whitespace-nowrap leading-none touch-target", className].filter(Boolean).join(" ")}>xprtn</Link>;
}
