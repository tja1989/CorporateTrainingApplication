"use client";
import "./globals.css";
import { Button } from "@/components/ui";
import { SystemState } from "@/components/system-state";
/** Last-resort boundary owns html/body because it replaces the root layout. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body><SystemState title="We couldn’t open welearn" body={`Try again. If the problem continues, contact your administrator.${error.digest ? ` Reference: ${error.digest}` : ""}`}><Button onClick={reset}>Try again</Button></SystemState></body></html>;
}
