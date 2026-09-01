"use client";

import { Button, EmptyState } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md">
        <EmptyState
          icon="⚠"
          title="Something went wrong"
          body={error.digest ? `Please try again. Reference: ${error.digest}` : "Please try again."}
          action={<Button onClick={reset}>Try again</Button>}
        />
      </div>
    </main>
  );
}
