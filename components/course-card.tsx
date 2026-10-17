import { CourseCover } from "./course-cover";
import { Card, Chip, Icon, Progress } from "./ui";
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
      <Progress value={pct} label={label} />
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
      <Card interactive className="relative h-full overflow-hidden">
        <CourseCover
          title={course.title}
          coverUrl={course.coverUrl}
          tags={course.tags}
        />
        {!courseHasOpened(course.startsAt) ? (
          <span className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-foreground shadow-[var(--shadow-resting)]">
            <Icon name="clock" size={14} />
            Opens {formatDay(course.startsAt!)}
          </span>
        ) : null}
        <div className="p-4">
          <div className="mb-2 flex flex-wrap gap-2">
            {course.tags.slice(0, 2).map((tag) => (
              <Chip key={tag} variant="neutral">
                {tagLabel(tag)}
              </Chip>
            ))}
          </div>
          <h3 className="type-section mb-2">{course.title}</h3>
          <p className="mb-3 line-clamp-2 text-sm text-muted">
            {course.description}
          </p>
          <p className="mb-3 flex flex-wrap gap-x-4 text-sm text-muted">
            <span>{course.estMinutes} min</span>
            <span>{languageName(course.language)}</span>
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
