import Link from "next/link";
import {
  ButtonAnchor,
  ButtonLink,
  Card,
  Chip,
  EmptyState,
  Icon,
  PillLink,
  complianceChip,
} from "@/components/ui";
import { LearningProgress } from "@/components/course-card";
import { lessonTypeLabel } from "@/components/lesson-icon";
import { formatDay, formatDue } from "@/lib/format";
import type {
  CompletedCourse,
  EarnedCertificate,
  InProgressCourse,
} from "@/lib/lms/my-learning";

export type BoardTab = "progress" | "completed" | "certificates";

export function boardTab(value: unknown): BoardTab {
  return value === "completed" || value === "certificates" ? value : "progress";
}

/** My courses: the learner's own training in three tabs, certificates one click away. */
export function MyLearningBoard({
  tab,
  learnerName,
  inProgress,
  completed,
  certificates,
}: {
  tab: BoardTab;
  learnerName: string;
  inProgress: InProgressCourse[];
  completed: CompletedCourse[];
  certificates: EarnedCertificate[];
}) {
  const tabs: [BoardTab, string, number][] = [
    ["progress", "In progress", inProgress.length],
    ["completed", "Completed", completed.length],
    ["certificates", "Certificates", certificates.length],
  ];
  return (
    <section aria-label="My courses">
      <nav aria-label="My course status" className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([key, label, count]) => (
          <PillLink
            key={key}
            href={`/learn?view=mine&tab=${key}`}
            active={tab === key}
            aria-current={tab === key ? "page" : undefined}
          >
            {label} ({count})
          </PillLink>
        ))}
      </nav>
      {tab === "progress" ? (
        inProgress.length ? (
          <div className="flex flex-col gap-4">
            {inProgress.map((c) => (
              <InProgressCard key={c.course.id} item={c} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing in progress"
            body="Courses assigned to you appear here until you finish them."
            action={
              <ButtonAnchor href="/learn?view=browse">
                Browse courses
              </ButtonAnchor>
            }
          />
        )
      ) : null}
      {tab === "completed" ? (
        completed.length ? (
          <div className="flex flex-col gap-4">
            {completed.map((c) => (
              <CompletedCard key={c.course.id} item={c} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No completed courses yet"
            body="Finished courses, your ratings and certificates appear here."
          />
        )
      ) : null}
      {tab === "certificates" ? (
        certificates.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((cert) => (
              <CertificateCard
                key={cert.id}
                cert={cert}
                learnerName={learnerName}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No certificates yet"
            body="Complete a course that issues a certificate and you can download it here."
          />
        )
      ) : null}
    </section>
  );
}

function InProgressCard({ item }: { item: InProgressCourse }) {
  const { course, enrollment, pct, next } = item;
  const chip = enrollment ? complianceChip(enrollment.complianceStatus) : null;
  const meta = [
    `${item.doneLessons} of ${item.totalLessons} lessons`,
    enrollment?.dueAt ? formatDue(enrollment.dueAt) : null,
  ].filter(Boolean);
  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <Link
          href={`/course/${course.id}`}
          className="type-section hover:underline"
        >
          {course.title}
        </Link>
        {chip ? <Chip variant={chip.variant}>{chip.label}</Chip> : null}
      </div>
      <p className="mb-3 text-sm text-muted">Course · {meta.join(" · ")}</p>
      <div className="mb-4 max-w-md">
        <LearningProgress pct={pct} label={`${pct}% complete`} />
      </div>
      {item.blockedMessage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border p-4">
          <p className="text-sm text-muted">{item.blockedMessage}</p>
          <ButtonLink variant="secondary" href={`/course/${course.id}`}>
            View course
          </ButtonLink>
        </div>
      ) : next ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border p-4">
          <div>
            <p className="font-medium">{next.title}</p>
            <p className="text-sm text-muted">
              {lessonTypeLabel(next.type)}
              {next.minutes ? ` (${next.minutes} min)` : ""}
            </p>
          </div>
          <ButtonLink href={next.href}>
            {item.doneLessons > 0 ? "Continue" : "Get started"}
          </ButtonLink>
        </div>
      ) : null}
    </Card>
  );
}

function CompletedCard({ item }: { item: CompletedCourse }) {
  const { course } = item;
  return (
    <Card className="flex flex-wrap items-start gap-4 p-5">
      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-success-tint text-success-fg">
        <Icon name="check" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={`/course/${course.id}`}
          className="type-section hover:underline"
        >
          {course.title}
        </Link>
        <p className="mb-3 text-sm text-muted">
          Course · Completed {formatDay(item.completedAt, { withYear: true })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {item.certificateId ? (
            <ButtonAnchor
              href={`/api/certificates/${item.certificateId}?download=1`}
            >
              Download certificate
            </ButtonAnchor>
          ) : null}
          {item.rated ? (
            <>
              <Chip variant="success">Rating saved</Chip>
              <ButtonLink
                variant="ghost"
                href={`/course/${course.id}/feedback?completionId=${item.completionId}`}
              >
                Edit rating
              </ButtonLink>
            </>
          ) : (
            <ButtonLink
              variant="secondary"
              href={`/course/${course.id}/feedback?completionId=${item.completionId}`}
            >
              <Icon name="star" size={16} />
              Rate this course
            </ButtonLink>
          )}
        </div>
      </div>
    </Card>
  );
}

function CertificateCard({
  cert,
  learnerName,
}: {
  cert: EarnedCertificate;
  learnerName: string;
}) {
  const expired = !!cert.expiresAt && cert.expiresAt < new Date();
  return (
    <Card className="flex flex-col p-4">
      <a
        href={`/api/certificates/${cert.id}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`View certificate for ${cert.courseTitle}`}
        className="mb-4 block rounded-control border-4 border-double border-border bg-surface-2 px-4 py-6 text-center"
      >
        <span className="block text-xs font-semibold uppercase tracking-wide text-primary">
          xprtn
        </span>
        <span className="mt-2 block text-xs uppercase tracking-wide text-muted">
          Certificate of completion
        </span>
        <span className="mt-3 block text-lg font-semibold">{learnerName}</span>
        <span className="mt-1 block text-xs text-muted">
          has successfully completed
        </span>
        <span className="mt-1 block text-sm font-medium">
          {cert.courseTitle}
        </span>
        <span className="mt-3 block text-xs text-muted">
          {formatDay(cert.issuedAt, { withYear: true })}
        </span>
      </a>
      <p className="font-semibold">{cert.courseTitle}</p>
      <p className="mb-4 text-sm text-muted">
        Completed {formatDay(cert.issuedAt, { withYear: true })}
        {cert.expiresAt
          ? expired
            ? ` · Expired ${formatDay(cert.expiresAt, { withYear: true })}`
            : ` · Valid until ${formatDay(cert.expiresAt, { withYear: true })}`
          : ""}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <ButtonAnchor href={`/api/certificates/${cert.id}?download=1`}>
          Download certificate
        </ButtonAnchor>
        <ButtonAnchor
          variant="ghost"
          href={`/api/certificates/${cert.id}`}
          target="_blank"
          rel="noreferrer"
        >
          View
        </ButtonAnchor>
      </div>
    </Card>
  );
}
