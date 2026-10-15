import { moderateFeedbackAction } from "@/app/(workspace)/feedback/actions";
import type { ModerationItem } from "@/lib/feedback/reports";
import { id } from "@/lib/ids";
import { Button, Field, Textarea } from "./ui";
import { WorkspaceForm } from "./workspace-form";
export function FeedbackModeration({ items }: { items: ModerationItem[] }) {
  if (!items.length) return null;
  return (
    <section
      aria-label="Feedback moderation"
      className="mt-8 rounded-card border border-border bg-surface p-5"
    >
      <h2 className="mb-2 text-xl font-semibold">Moderation</h2>
      <p className="mb-4 text-sm text-muted">
        These controls use the latest saved response. Hiding suppresses comments
        across all periods. Invalid-response exclusion applies from its recorded
        decision time; ratings remain in protected audit history.
      </p>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <details
            key={item.id}
            data-testid={`moderation-${item.id}`}
            className="py-3"
          >
            <summary className="touch-target flex cursor-pointer items-center font-medium">
              {item.course} · {item.employeeName} · {item.rating}/5
            </summary>
            <p className="mt-3 text-xs font-medium text-muted">
              Original comment, visible only to HR and Super Admin, version{" "}
              {item.revision}
            </p>
            <p className="my-3 whitespace-pre-wrap break-words rounded-control bg-surface-2 p-3 text-sm">
              {item.comment || "No comment"}
            </p>
            {item.reason ? (
              <p className="mb-3 text-sm text-muted">
                Last moderation reason: {item.reason}
              </p>
            ) : null}
            <WorkspaceForm
              action={moderateFeedbackAction.bind(null, item.kind, item.id)}
            >
              <input type="hidden" name="revision" value={item.revision} />
              <input type="hidden" name="requestId" value={id()} />
              <div className="mb-4 grid gap-2">
                <label className="touch-target flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="hidden"
                    defaultChecked={item.hidden}
                    className="accent-primary"
                  />
                  Hide comment from reports
                </label>
                <label className="touch-target flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="excluded"
                    defaultChecked={item.excluded}
                    className="accent-primary"
                  />
                  Exclude invalid response from ratings
                </label>
              </div>
              <Field label="Moderation reason">
                <Textarea name="reason" required maxLength={2000} rows={3} />
              </Field>
              <Button type="submit" variant="secondary">
                Save moderation
              </Button>
            </WorkspaceForm>
          </details>
        ))}
      </div>
    </section>
  );
}
