import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** Rendered first on every preview page so nobody mistakes it for a learner's real session. */
export function PreviewBanner({ backHref }: { backHref: string }) {
  return (
    <div role="region" aria-label="Preview" className="sticky top-0 z-30 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-warning-tint px-4 py-2 text-sm text-warning-fg">
      <p className="font-medium">Preview — nothing is saved</p>
      <Link href={backHref} className={buttonClass("secondary")}>Back to editor</Link>
    </div>
  );
}
