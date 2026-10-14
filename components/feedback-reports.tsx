import {
  Button,
  ButtonLink,
  Field,
  Input,
  PageTitle,
  PillLink,
  Select,
} from "./ui";
import type { FeedbackReport } from "@/lib/feedback/reports";
import type { FeedbackReportParams } from "@/lib/feedback/report-options";
import type { Actor } from "@/lib/auth/roles";
import { FeedbackModeration } from "./feedback-moderation";
import { DEFAULT_TZ } from "@/lib/time";
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
      <nav aria-label="Feedback type" className="mb-5 flex flex-wrap gap-2">
        <PillLink href={tab("course")} active={kind === "course"}>
          Course
        </PillLink>
        <PillLink href={tab("instructor")} active={kind === "instructor"}>
          Instructor
        </PillLink>
      </nav>
      <form
        method="get"
        className="mb-6 rounded-card border border-border bg-surface p-4 sm:p-5"
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
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Reporting period">
            <Select name="period" defaultValue={params.period ?? "week"}>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="custom">Custom dates</option>
            </Select>
          </Field>
          <Field label="Start date" hint="For custom periods">
            <Input type="date" name="start" defaultValue={params.start ?? ""} />
          </Field>
          <Field label="Through date" hint="Includes this day">
            <Input type="date" name="end" defaultValue={params.end ?? ""} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Apply period</Button>
          {report ? (
            <ButtonLink
              variant="secondary"
              href={`/api/feedback/reports/csv?${query}`}
            >
              Download CSV
            </ButtonLink>
          ) : null}
          <span className="text-sm text-muted">Timezone: {DEFAULT_TZ}</span>
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
          <p className="mb-4 text-sm text-muted">
            {report.periodLabel} · Based on original submission date and the
            latest revision before this period ends.
          </p>
          <dl className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-card border border-border bg-surface p-5">
              <dt className="text-sm text-muted">Responses</dt>
              <dd
                data-testid="feedback-response-count"
                className="mt-1 text-3xl font-semibold"
              >
                {report.responses}
              </dd>
            </div>
            <div className="rounded-card border border-border bg-surface p-5">
              <dt className="text-sm text-muted">Average rating</dt>
              <dd
                data-testid="feedback-average"
                className="mt-1 text-3xl font-semibold"
              >
                {report.average === null
                  ? "No responses"
                  : `${report.average} / 5`}
              </dd>
            </div>
          </dl>
          <section
            aria-label="Rating distribution"
            className="mb-6 rounded-card border border-border bg-surface p-5"
          >
            <h2 className="mb-3 font-semibold">Rating distribution</h2>
            <div className="grid gap-2">
              {report.distribution.map((count, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  <span className="w-14 shrink-0">
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
                <thead>
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
                              ? new Intl.DateTimeFormat("en", {
                                  timeZone: DEFAULT_TZ,
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(String(cell)))
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
            <p className="rounded-card border border-border bg-surface p-5 text-muted">
              No responses for this period and your permitted training scope.
            </p>
          )}
          <FeedbackModeration items={report.moderationItems} />
        </>
      ) : null}
    </div>
  );
}
