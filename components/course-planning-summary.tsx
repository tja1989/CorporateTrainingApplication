import type {
  CoursePlanningAccess,
  RequiredCourse,
} from "@/lib/lms/planning-access";
import { ButtonAnchor } from "./ui";
import { formatDay } from "@/lib/format";

const day = (date: Date) => formatDay(date);
export function CoursePlanningSummary({
  course,
  enrollment,
  prerequisites,
}: {
  course: { startsAt: Date | null; endsAt: Date | null; folderPath: string };
  enrollment: { createdAt: Date; dueAt: Date | null } | null;
  prerequisites: RequiredCourse[];
}) {
  return (
    <section
      aria-label="Course schedule"
      className="mb-6 border-y border-border py-5"
    >
      <h2 className="mb-3 text-lg font-semibold">Schedule and prerequisites</h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted">Course start date</dt>
          <dd>
            {course.startsAt ? (
              <time dateTime={course.startsAt.toISOString()}>
                {day(course.startsAt)}
              </time>
            ) : (
              "No start date set"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Course end target</dt>
          <dd>
            {course.endsAt ? (
              <time dateTime={course.endsAt.toISOString()}>
                {day(course.endsAt)}
              </time>
            ) : (
              "Not set"
            )}
          </dd>
        </div>
        {enrollment ? (
          <>
            <div>
              <dt className="text-muted">Enrollment date</dt>
              <dd>
                <time
                  data-testid="enrollment-date"
                  dateTime={enrollment.createdAt.toISOString()}
                >
                  {day(enrollment.createdAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Your assignment deadline</dt>
              <dd>
                {enrollment.dueAt ? (
                  <time dateTime={enrollment.dueAt.toISOString()}>
                    {day(enrollment.dueAt)}
                  </time>
                ) : (
                  "No deadline"
                )}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      <p className="mt-3 text-sm text-muted">
        The end date is a target; overdue training can still be completed.
      </p>
      {course.folderPath ? (
        <p className="mt-3 text-sm">
          Folder:{" "}
          <a
            className="touch-target inline-flex items-center break-words text-link underline"
            href={`/learn?view=browse&folder=${encodeURIComponent(course.folderPath)}`}
          >
            {course.folderPath}
          </a>
        </p>
      ) : null}
      {prerequisites.length ? (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium">Required courses</h3>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {prerequisites.map((required) => (
              <li key={required.id}>
                {required.available ? (
                  <a
                    className="touch-target inline-flex items-center text-link underline"
                    href={`/course/${required.id}`}
                  >
                    {required.title}
                  </a>
                ) : (
                  <span className="text-muted">
                    Unavailable prerequisite · contact your training team
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
export function CoursePlanningGate({
  access,
  path,
}: {
  access: CoursePlanningAccess;
  path: { pathId: string; title: string } | null;
}) {
  if (!access.blocked && !path) return null;
  return (
    <section
      className="mb-6 rounded-card border border-border bg-surface p-5"
      aria-label="Training availability"
    >
      <h2 className="mb-2 text-lg font-semibold">
        {access.blocked && access.reason === "scheduled"
          ? "Scheduled training"
          : "Before you start"}
      </h2>
      <p className="text-muted">
        {access.blocked
          ? access.message
          : `Complete the earlier courses in “${path!.title}” to unlock this course.`}
      </p>
      {path ? (
        <ButtonAnchor
          href={`/path/${path.pathId}`}
          variant="secondary"
          className="mt-4"
        >
          View learning path
        </ButtonAnchor>
      ) : null}
      {access.blocked && access.reason === "prerequisite" ? (
        <ul className="mt-3 flex flex-col gap-2">
          {access.requiredCourses?.map((required) => (
            <li key={required.id}>
              {required.available ? (
                <a
                  className="touch-target inline-flex items-center text-link underline"
                  href={`/course/${required.id}`}
                >
                  {required.title}
                </a>
              ) : (
                <span className="text-sm text-muted">
                  A required course is unavailable. Contact your training team.
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
