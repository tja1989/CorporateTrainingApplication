import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { ownFeedback, feedbackContext } from "@/lib/feedback/service";
import { id } from "@/lib/ids";
import { DEFAULT_TZ } from "@/lib/time";
import { CourseFeedbackForm } from "@/components/course-feedback-form";
import { ButtonLink, PageTitle } from "@/components/ui";
import { saveFeedbackAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ completionId?: string }>;
}) {
  const user = await requireUser(),
    { courseId } = await params,
    { completionId: chosen } = await searchParams;
  const [latest] = chosen
    ? []
    : await db
        .select()
        .from(t.completionRecords)
        .where(
          and(
            eq(t.completionRecords.userId, user.id),
            eq(t.completionRecords.courseId, courseId),
          ),
        )
        .orderBy(
          desc(t.completionRecords.completedAt),
          desc(t.completionRecords.id),
        )
        .limit(1);
  const completionId = chosen ?? latest?.id;
  if (!completionId) notFound();
  let current: Awaited<ReturnType<typeof ownFeedback>>;
  let completedAt: Date;
  try {
    const { completion } = await feedbackContext(user.id, completionId);
    if (completion.courseId !== courseId) notFound();
    completedAt = completion.completedAt;
    current = await ownFeedback(user.id, completionId);
  } catch {
    notFound();
  }
  const [course] = await db
    .select()
    .from(t.courses)
    .where(eq(t.courses.id, courseId))
    .limit(1);
  const [trainer] = current.delivery?.instructorId
    ? await db
        .select({ name: t.users.name })
        .from(t.users)
        .where(eq(t.users.id, current.delivery.instructorId))
        .limit(1)
    : [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        sub={`${course?.title ?? "Completed course"} · Training completed ${new Intl.DateTimeFormat("en", { timeZone: DEFAULT_TZ, dateStyle: "medium" }).format(completedAt)} · Feedback is optional and does not affect completion or certificates.`}
      >
        Course and instructor feedback
      </PageTitle>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted">
        Feedback is attributed to your account. HR and Super Admin can read both
        responses. The course’s Department Head can read attributed course
        comments and aggregated instructor ratings. The delivered instructor can
        see ratings and comments without account names; small groups and what
        you write may still identify you.
      </p>
      <div className="grid min-w-0 gap-6">
        <CourseFeedbackForm
          kind="course"
          initial={current.course}
          requestId={id()}
          action={saveFeedbackAction.bind(null, completionId, "course")}
        />
        {current.delivery?.instructorId === user.id ? (
          <p className="rounded-control bg-surface-2 p-4 text-sm text-muted">
            You delivered this training. You can give course feedback, but
            cannot rate your own instructor performance.
          </p>
        ) : current.delivery?.instructorId ? (
          <>
            <p className="text-sm text-muted">
              Delivered instructor: {trainer?.name ?? "Assigned instructor"}
            </p>
            <CourseFeedbackForm
              kind="instructor"
              initial={current.instructor}
              requestId={id()}
              action={saveFeedbackAction.bind(null, completionId, "instructor")}
            />
          </>
        ) : (
          <p className="rounded-control bg-surface-2 p-4 text-sm text-muted">
            The historical instructor is unknown for this cycle. You can still
            give course feedback.
          </p>
        )}
      </div>
      <ButtonLink href="/profile#history" variant="secondary" className="mt-6">
        Back to learning history
      </ButtonLink>
    </div>
  );
}
