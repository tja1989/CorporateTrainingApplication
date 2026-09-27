"use client";
import { useEffect, useState } from "react";
import { completeLessonAction } from "@/app/(learner)/lesson/actions";
import { Button } from "./ui";
/** Completion is acknowledged by the server before loading the fresh outline.
 * A document navigation avoids the stale Flight redirect observed after resume. */
export function CompleteLessonForm({ lessonId }: { lessonId: string }) {
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setReady(true), []);
  return <form method="post" aria-busy={!ready || pending} onSubmit={async event => {
    event.preventDefault(); if (!ready || pending) return;
    setPending(true); setError(null);
    try { const result = await completeLessonAction(lessonId); window.location.assign(result.href); }
    catch { setError("Completion could not be confirmed. Please try again."); setPending(false); }
  }}><Button type="submit" disabled={!ready || pending}>{pending ? "Saving completion…" : "Mark complete"}</Button>{!ready ? <p role="status" className="mt-2 text-sm text-muted">Loading completion control…</p> : null}{error ? <p role="alert" className="mt-2 text-sm text-destructive-text">{error}</p> : null}</form>;
}
