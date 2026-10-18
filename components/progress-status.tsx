import { Progress } from "./ui";
import { progressMessage } from "@/lib/lms/progress-message";

/** "Course progress · 3/8 lessons" with an encouraging status line. */
export function ProgressStatus({ done, total, detail }: { done: number; total: number; detail?: string }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <section aria-label="Course progress" className="rounded-card border border-border bg-surface-2 p-4">
      <p className="mb-2 text-sm font-semibold">
        Course progress · {done}/{total} lessons
      </p>
      <Progress value={pct} label={`${done} of ${total} lessons complete`} />
      <p className="mt-2 text-sm text-muted">
        {progressMessage(done, total)}
        {detail ? ` ${detail}` : ""}
      </p>
    </section>
  );
}
