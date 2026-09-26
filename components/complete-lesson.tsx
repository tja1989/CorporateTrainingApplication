"use client";
import { useState } from "react";
import { completeLessonAction } from "@/app/(learner)/lesson/actions";
import { Button } from "./ui";
/** Completion is acknowledged by the server before loading the fresh outline.
 * A document navigation avoids the stale Flight redirect observed after resume. */
export function CompleteLessonForm({ lessonId }: { lessonId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <form onSubmit={async event => {
    event.preventDefault(); setPending(true); setError(null);
    try { const result = await completeLessonAction(lessonId); window.location.assign(result.href); }
    catch { setError("Completion could not be confirmed. Please try again."); setPending(false); }
  }}><Button type="submit" disabled={pending}>{pending ? "Saving completion…" : "Mark complete"}</Button>{error ? <p role="alert" className="mt-2 text-sm text-destructive-text">{error}</p> : null}</form>;
}
