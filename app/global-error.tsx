"use client";

import "./globals.css";
import { IconDisc } from "@/components/icons";

/** Last-resort boundary (replaces the root layout), so it carries its own <html>/<body>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-dvh items-center justify-center px-4">
          <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-12 text-center">
            <IconDisc name="warning" tone="destructive" size={56} className="animate-pop mb-2" />
            <h1 className="display text-lg">Something went wrong</h1>
            <p className="max-w-sm text-sm text-muted">{error.digest ? `Reference: ${error.digest}` : "Please try again."}</p>
            <button onClick={reset} className="pressable touch-target mt-2 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-accent hover:text-accent-fg">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
