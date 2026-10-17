import { Button, ButtonAnchor, EmptyState, PageTitle } from "./ui";
import { WorkspaceTabs } from "./workspace-ui";
import type { FeedbackReport } from "@/lib/feedback/reports";
import type { FeedbackReportParams } from "@/lib/feedback/report-options";
import type { Actor } from "@/lib/auth/roles";
import { FeedbackPeriodFields } from "./feedback-period-fields";
import { FeedbackModeration } from "./feedback-moderation";
import { formatDateTime } from "@/lib/format";
export function FeedbackReports({
  actor,
  params,
  report,
  error,
}: {
  actor: Actor;
  params: FeedbackReportParams;
  report: FeedbackReport | null;
  error?: string;
}) {
  const kind = params.kind === "instructor" ? "instructor" : "course";
  const query = new URLSearchParams();
  for (const key of [
    "kind",
    "period",
    "start",
    "end",
    "courseId",
    "instructorId",
  ] as const)
    if (params[key]) query.set(key, params[key]!);
  const tab = (next: string) => {
    const q = new URLSearchParams(query);
    q.set("kind", next);
    return "/feedback?" + q;
  };
  return (
    <div>
      <PageTitle
        sub={
          actor.role === "INSTRUCTOR"
            ? "Ratings and comments for courses you delivered. Account names are omitted; small groups or comments can still identify a writer."
            : actor.role === "DEPARTMENT_HEAD"
              ? "Course detail and instructor summaries for your department’s delivered training."
              : "Course and instructor feedback across the organization."
        }
      >
        Feedback reports
      </PageTitle>
      <WorkspaceTabs
        label="Feedback type"
        items={[
          { href: tab("course"), label: "Course", active: kind === "course" },
          { href: tab("instructor"), label: "Instructor", active: kind === "instructor" },
        ]}
      />
      <form
        method="get"
        className="mb-8 rounded-card bg-surface-2 p-4 sm:p-5"
      >
        <input type="hidden" name="kind" value={kind} />
        {params.courseId ? (
          <input type="hidden" name="courseId" value={params.courseId} />
        ) : null}
        {params.instructorId ? (
          <input
            type="hidden"
            name="instructorId"
            value={params.instructorId}
          />
        ) : null}
        <FeedbackPeriodFields params={params} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Apply period</Button>
          {report ? (
            <ButtonAnchor
              variant="secondary"
              href={`/api/feedback/reports/csv?${query}`}
            >
              Download CSV
            </ButtonAnchor>
          ) : null}
        </div>
      </form>
      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-control bg-destructive-tint p-4 text-destructive-text"
        >
          {error}
        </p>
      ) : null}
      {report ? (
        <>
          <p className="mb-3 text-sm text-muted">
            <span className="font-medium text-foreground">{report.periodLabel}</span>. Counted by original submission date.
          </p>
          <dl className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-card border border-border bg-surface p-4 shadow-[var(--shadow-resting)]">
              <dt className="text-sm text-muted">Responses</dt>
              <dd data-testid="feedback-response-count" className="type-number mt-1 text-3xl">
                {report.responses}
              </dd>
            </div>
            <div className="rounded-card border border-border bg-surface p-4 shadow-[var(--shadow-resting)]">
              <dt className="text-sm text-muted">Average rating</dt>
              <dd
                data-testid="feedback-average"
                className={report.average === null ? "mt-2 text-lg font-medium text-muted" : "type-number mt-1 text-3xl"}
              >
                {report.average === null ? "No responses" : `${report.average} / 5`}
              </dd>
            </div>
          </dl>
          {report.responses ? (
          <section
            aria-label="Rating distribution"
            className="mb-6 rounded-card border border-border bg-surface p-5"
          >
            <h2 className="type-section mb-3">Rating distribution</h2>
            <div className="grid gap-2">
              {report.distribution.map((count, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0">
                    {index + 1} {index ? "stars" : "star"}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: report.responses
                          ? `${(count / report.responses) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </section>
          ) : null}
          {report.rows.length ? (
            <div
              role="region"
              aria-label="Feedback responses"
              tabIndex={0}
              className="overflow-x-auto rounded-card border border-border bg-surface focus-visible:outline-2 focus-visible:outline-primary"
            >
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  {kind} feedback · {report.periodLabel}
                </caption>
                <thead className="bg-surface-2">
                  <tr>
                    {report.columns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="whitespace-nowrap border-b border-border p-3 font-medium"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, column) => (
                        <td
                          key={column}
                          className="min-w-28 border-b border-border p-3 align-top"
                        >
                          <span className="whitespace-pre-wrap break-words">
                            {report.columns[column] === "Submitted"
                              ? formatDateTime(new Date(String(cell)))
                              : cell}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mb-6">
              <EmptyState icon="star" title="No responses in this period" body="Feedback appears here after people complete training and rate it. Try a longer period." />
            </div>
          )}
          <FeedbackModeration items={report.moderationItems} />
        </>
      ) : null}
    </div>
  );
}
