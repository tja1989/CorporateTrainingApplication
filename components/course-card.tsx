import { CourseCover } from "./course-cover";
import { Card, Chip } from "./ui";
import { courseHasOpened } from "@/lib/courses/planning";
import type { CourseWithProgress } from "@/lib/lms/queries";
import { formatDay, languageName, tagLabel } from "@/lib/format";

type Course = CourseWithProgress["course"];
export function LearningProgress({
  pct,
  label,
}: {
  pct: number;
  label: string;
}) {
  return (
    <div>
      <div className="mb-2 text-sm text-muted">{label}</div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-control bg-surface-2"
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
export function CourseCard({
  course,
  progress,
  reason,
}: {
  course: Course;
  progress?: CourseWithProgress;
  reason?: string;
}) {
  return (
    <a
      href={`/course/${course.id}`}
      className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <Card className="h-full overflow-hidden hover:bg-surface-2">
        <CourseCover
          title={course.title}
          coverUrl={course.coverUrl}
          tags={course.tags}
        />
        <div className="p-4">
          <div className="mb-2 flex flex-wrap gap-2">
            {!courseHasOpened(course.startsAt) ? (
              <Chip variant="neutral">
                Opens{" "}
                {formatDay(course.startsAt!)}
              </Chip>
            ) : null}
            {course.tags.slice(0, 2).map((tag) => (
              <Chip key={tag} variant="neutral">
                {tagLabel(tag)}
              </Chip>
            ))}
          </div>
          <h3 className="mb-2 text-lg font-semibold">{course.title}</h3>
          <p className="mb-3 line-clamp-2 text-sm text-muted">
            {course.description}
          </p>
          <p className="mb-3 text-sm text-muted">
            {course.estMinutes} min · {languageName(course.language)}
          </p>
          {progress ? (
            <LearningProgress
              pct={progress.pct}
              label={`${progress.doneLessons} of ${progress.totalLessons} lessons complete`}
            />
          ) : null}
          {reason ? <p className="mt-3 text-sm text-muted">{reason}</p> : null}
        </div>
      </Card>
    </a>
  );
}
