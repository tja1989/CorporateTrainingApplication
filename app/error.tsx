"use client";
import { Button, ButtonLink } from "@/components/ui";
import { SystemState } from "@/components/system-state";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SystemState title="We couldn’t load this page" body={`Try loading the page again. If the problem continues, contact your administrator.${error.digest ? ` Reference: ${error.digest}` : ""}`}><Button onClick={reset}>Try again</Button><ButtonLink variant="secondary" href="/">Go home</ButtonLink></SystemState>;
}
