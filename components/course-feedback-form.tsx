"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Field, Textarea } from "./ui";
import type { FeedbackKind, SavedFeedback } from "@/lib/feedback/types";
import type { FeedbackActionResult } from "@/app/(learner)/course/[courseId]/feedback/actions";
import { formatDateTime } from "@/lib/format";
const scores = [
  [1, "Poor"],
  [2, "Fair"],
  [3, "Good"],
  [4, "Very good"],
  [5, "Excellent"],
] as const;
export function CourseFeedbackForm({
  kind,
  initial,
  requestId: initialRequestId,
  action,
}: {
  kind: FeedbackKind;
  initial: SavedFeedback | null;
  requestId: string;
  action: (form: FormData) => Promise<FeedbackActionResult>;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0),
    [comment, setComment] = useState(initial?.comment ?? ""),
    [saved, setSaved] = useState(initial),
    [revision, setRevision] = useState(initial?.revision ?? 0),
    [requestId, setRequestId] = useState(initialRequestId);
  const [result, setResult] = useState<FeedbackActionResult | null>(null),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false);
  const sending = useRef(false);
  useEffect(() => setReady(true), []);
  const label = kind === "course" ? "Course feedback" : "Instructor feedback";
  const dirty =
    rating !== (saved?.rating ?? 0) || comment !== (saved?.comment ?? "");
  function load(value: SavedFeedback | null) {
    setSaved(value);
    setRating(value?.rating ?? 0);
    setComment(value?.comment ?? "");
    setRevision(value?.revision ?? 0);
    setRequestId(crypto.randomUUID());
    setResult(null);
  }
  return (
    <section
      aria-label={label}
      className="min-w-0 rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <h2 className="mb-2 text-xl font-semibold">{label}</h2>
      <p className="mb-5 text-sm text-muted">
        {kind === "course"
          ? "How useful was the content for your work?"
          : "How well did the instructor help you understand the material?"}
      </p>
      <form
        aria-busy={!ready || pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (sending.current) return;
          sending.current = true;
          setPending(true);
          setResult(null);
          const data = new FormData(event.currentTarget);
          void (async () => {
            try {
              const next = await action(data);
              setResult(next);
              if (next.saved) {
                setSaved(next.saved);
                setRating(next.saved.rating);
                setComment(next.saved.comment);
                setRevision(next.saved.revision);
                setRequestId(crypto.randomUUID());
              }
            } catch {
              setResult({
                error:
                  "Could not save feedback. Your entries are still here; try again.",
              });
            } finally {
              sending.current = false;
              setPending(false);
            }
          })();
        }}
      >
        <fieldset disabled={!ready || pending} className="min-w-0">
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="requestId" value={requestId} />
          <fieldset className="mb-5">
            <legend className="mb-2 text-sm font-medium">Rating</legend>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex">
                {scores.map(([value, text]) => (
                  <label
                    key={value}
                    className="touch-target relative flex cursor-pointer items-center justify-center rounded-control text-warning has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-primary"
                  >
                    <input
                      type="radio"
                      name="rating"
                      value={value}
                      checked={rating === value}
                      onChange={() => setRating(value)}
                      required
                      className="absolute inset-0 m-0 cursor-pointer opacity-0"
                    />
                    {/* Decorative: the transparent radio above covers the star, so every click lands on the radio itself. */}
                    <svg
                      data-star={value <= rating ? "filled" : "empty"}
                      className="pointer-events-none"
                      width="30"
                      height="30"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      fill={value <= rating ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    >
                      <path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" />
                    </svg>
                    <span className="sr-only">{`${value} — ${text}`}</span>
                  </label>
                ))}
              </div>
              <span className="text-sm text-muted" aria-hidden="true">
                {rating ? scores[rating - 1][1] : "Choose a rating"}
              </span>
            </div>
          </fieldset>
          <Field
            label="Comment or suggestion"
            hint="Optional · up to 2,000 characters"
          >
            <Textarea
              name="comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
              rows={5}
            />
          </Field>
          <Button type="submit" variant={dirty ? "primary" : "secondary"}>
            {pending ? "Saving…" : `Save ${kind} feedback`}
          </Button>
        </fieldset>
        {!ready ? (
          <p role="status" className="mt-3 text-sm text-muted">
            Preparing form…
          </p>
        ) : null}
        {result?.error ? (
          <div className="mt-4">
            <p
              role="alert"
              className="rounded-control bg-destructive-tint p-3 text-sm text-destructive-text"
            >
              {result.error}
            </p>
            {"current" in result ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={() => load(result.current ?? null)}
              >
                Load saved response
              </Button>
            ) : null}
          </div>
        ) : null}
        {saved || dirty ? (
          <p
            role="status"
            className={`mt-4 text-sm ${dirty ? "text-muted" : "text-success-fg"}`}
          >
            {dirty ? "Unsaved changes" : "Feedback saved"}
            {saved ? (
              <>
                {" "}
                · {dirty ? "Last saved: " : ""}
                {saved.rating}/5 ·{" "}
                {formatDateTime(new Date(saved.updatedAt))}
              </>
            ) : null}
          </p>
        ) : null}
        {saved?.commentHidden ? (
          <p className="mt-3 text-sm text-muted">
            Your comment is hidden from ordinary reports. Editing does not
            remove the moderation decision.
          </p>
        ) : null}
        {saved?.excluded ? (
          <p className="mt-3 text-sm text-muted">
            HR has left this response out of rating summaries.
          </p>
        ) : null}
        <noscript>
          <p className="mt-3 text-sm text-muted">
            Enable JavaScript to submit feedback.
          </p>
        </noscript>
      </form>
    </section>
  );
}
