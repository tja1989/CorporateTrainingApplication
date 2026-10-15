import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/guard";
import {
  canReadCourse,
  canAuthorCourse,
  courseWorkspacePath,
} from "@/lib/courses/ownership";
import { CourseWorkflow } from "@/components/course-workflow";
import { CoursePlanningFields } from "@/components/course-planning-fields";
import { isCourseAvailable } from "@/lib/courses/availability";
import { localDate } from "@/lib/time";
import { CourseLessonPreview } from "@/components/course-lesson-preview";
import {
  Button,
  Chip,
  Field,
  Input,
  Select,
  PageHeader,
  Textarea,
  Icon,
} from "@/components/ui";
import { statusLabel } from "@/lib/status";
import {
  WorkspaceLink,
  WorkspaceTabs,
  WorkspaceSection,
} from "@/components/workspace-ui";
import { WorkspaceForm, SubmitButton } from "@/components/workspace-form";
import { CourseCover } from "@/components/course-cover";
import { LessonIcon } from "@/components/lesson-icon";
import type { LessonType } from "@/lib/lms/outline";
import { parseInterviewConfig } from "@/lib/live/interview";
import {
  LessonForm,
  InterviewFields,
} from "@/app/(workspace)/admin/courses/lesson-form";
import {
  updateCourseAction,
  addModuleAction,
  updateInterviewLessonAction,
  updateContentLessonAction,
  retryIngestAction,
  moveLessonAction,
  moveModuleAction,
} from "@/app/(workspace)/admin/courses/actions";
import { lessonTypeLabel } from "./lesson-icon";
import { CoverUrlField } from "./cover-url-field";
import { languageName } from "@/lib/format";
export const dynamic = "force-dynamic";
export async function CourseEditor({
  actor,
  courseId,
  view = "curriculum",
}: {
  actor: CurrentUser;
  courseId: string;
  view?: string;
}) {
  const base = courseWorkspacePath(actor, courseId)
    .split("/")
    .slice(0, -1)
    .join("/");
  const [course] = await db
    .select()
    .from(t.courses)
    .where(eq(t.courses.id, courseId))
    .limit(1);
  if (!course || !canReadCourse(actor, course)) notFound();
  const editable =
    canAuthorCourse(actor, course) &&
    course.status === "DRAFT" &&
    course.approvalState !== "SUBMITTED";
  const departments = await db.select().from(t.departments);
  const folderOptions = [...new Set((await db.select({ folderPath: t.courses.folderPath }).from(t.courses)).map((row) => row.folderPath).filter(Boolean))].sort();
  const selectedPrerequisites = await db
    .select()
    .from(t.coursePrerequisites)
    .where(eq(t.coursePrerequisites.courseId, course.id));
  const selectedIds = selectedPrerequisites.map((row) => row.requiredCourseId);
  const prerequisiteChoices = (await db.select().from(t.courses))
    .filter(
      (row) =>
        row.id !== course.id &&
        (isCourseAvailable(row) || selectedIds.includes(row.id)),
    )
    .map((row) => ({
      id: row.id,
      title: isCourseAvailable(row) ? row.title : "Unavailable prerequisite",
      available: isCourseAvailable(row),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const instructors = (
    await db
      .select({
        id: t.users.id,
        name: t.users.name,
        role: t.users.role,
        erasedAt: t.users.erasedAt,
        passwordState: t.users.passwordState,
      })
      .from(t.users)
  ).filter(
    (u) =>
      u.role === "INSTRUCTOR" && !u.erasedAt && u.passwordState === "ACTIVE",
  );
  const mods = (
    await db.select().from(t.modules).where(eq(t.modules.courseId, courseId))
  ).sort((a, b) => a.sort - b.sort);
  const lessons = mods.length
    ? await db
        .select()
        .from(t.lessons)
        .where(
          inArray(
            t.lessons.moduleId,
            mods.map((m) => m.id),
          ),
        )
    : [];
  const videoIds = lessons.flatMap((l) =>
    l.payload.videoId ? [l.payload.videoId] : [],
  );
  const videos = videoIds.length
    ? await db.select().from(t.videos).where(inArray(t.videos.id, videoIds))
    : [];
  const banks = editable
    ? (await db.select().from(t.questionBanks)).filter(
        (bank) =>
          actor.role !== "INSTRUCTOR" ||
          !bank.courseId ||
          bank.courseId === courseId,
      )
    : [];
  return (
    <div className="min-w-0">
      <a
        href={base}
        className="link mb-4 inline-flex touch-target items-center"
      >
        ← All courses
      </a>
      <PageHeader
        title={course.title}
        sub={`${mods.length} module${mods.length === 1 ? "" : "s"} · ${lessons.length} lesson${lessons.length === 1 ? "" : "s"} · ${course.estMinutes} min`}
        actions={
          course.status === "PUBLISHED" ? (
            <WorkspaceLink href={`/course/${course.id}`}>
              View learner course
            </WorkspaceLink>
          ) : null
        }
      />
      <CourseWorkflow actor={actor} course={course} />
      <p className="mb-4 text-sm text-muted">
        Department:{" "}
        {departments.find((d) => d.id === course.departmentId)?.name ??
          "Unassigned"}{" "}
        · Instructor:{" "}
        {instructors.find((i) => i.id === course.instructorId)?.name ??
          "Unassigned"}
      </p>
      <WorkspaceTabs
        label="Course editor"
        items={[
          {
            href: `${base}/${course.id}`,
            label: "Curriculum",
            active: view === "curriculum",
          },
          {
            href: `${base}/${course.id}?view=settings`,
            label: "Settings",
            active: view === "settings",
          },
        ]}
      />
      <fieldset disabled={!editable} className="min-w-0">
        {view === "curriculum" ? (
          <div className="max-w-4xl space-y-6">
            <p className="mb-4 text-sm text-muted">
              {canAuthorCourse(actor, course)
                ? "Build your modules in learning order."
                : "Review the curriculum and record your decision above."}{" "}
              {course.sequentialLock
                ? "Learners must complete lessons in order."
                : "Learners can choose their lesson order."}{" "}
              {course.status !== "PUBLISHED"
                ? "Submit this revision for Department Head approval before HR publishes it."
                : "Revise this published course before making changes; the next revision needs approval."}
            </p>
            {mods.map((mod, index) => {
              const items = lessons
                .filter((l) => l.moduleId === mod.id)
                .sort((a, b) => a.sort - b.sort);
              return (
                <WorkspaceSection
                  key={mod.id}
                  title={mod.title}
                  description={`Module ${index + 1} · ${items.length} lesson${items.length === 1 ? "" : "s"}`}
                >
                  <div
                    hidden={!editable}
                    role="group"
                    aria-label={`${mod.title} order`}
                    className={
                      editable
                        ? "mb-3 flex flex-wrap items-center justify-end gap-1"
                        : "hidden"
                    }
                  >
                    <span className="me-2 text-sm text-muted">
                      Module order
                    </span>
                    <WorkspaceForm
                      action={moveModuleAction.bind(
                        null,
                        course.id,
                        mod.id,
                        -1,
                      )}
                    >
                      <input
                        type="hidden"
                        name="revision"
                        value={course.contentRevision}
                      />
                      <Button
                        variant="ghost"
                        type="submit"
                        aria-label={`Move module ${mod.title} up`}
                        disabled={index === 0}
                        className="px-2"
                      >
                        <Icon name="arrow-up" size={16} />
                      </Button>
                    </WorkspaceForm>
                    <WorkspaceForm
                      action={moveModuleAction.bind(null, course.id, mod.id, 1)}
                    >
                      <input
                        type="hidden"
                        name="revision"
                        value={course.contentRevision}
                      />
                      <Button
                        variant="ghost"
                        type="submit"
                        aria-label={`Move module ${mod.title} down`}
                        disabled={index === mods.length - 1}
                        className="px-2"
                      >
                        <Icon name="arrow-down" size={16} />
                      </Button>
                    </WorkspaceForm>
                  </div>
                  <ol className="mb-4 divide-y divide-border">
                    {items.map((lesson, i) => {
                      const video = videos.find(
                        (v) => v.id === lesson.payload.videoId,
                      );
                      return (
                        <li key={lesson.id} className="min-w-0 py-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <LessonIcon type={lesson.type as LessonType} />
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                              <p className="break-words font-medium">
                                {lesson.title}
                              </p>
                              <Chip>{lessonTypeLabel(lesson.type)}</Chip>
                            </div>
                            <div
                              className={
                                editable ? "flex shrink-0 gap-1" : "hidden"
                              }
                            >
                              <WorkspaceForm
                                action={moveLessonAction.bind(
                                  null,
                                  course.id,
                                  lesson.id,
                                  -1,
                                )}
                              >
                                <input
                                  type="hidden"
                                  name="revision"
                                  value={course.contentRevision}
                                />
                                <Button
                                  variant="ghost"
                                  type="submit"
                                  aria-label={`Move ${lesson.title} up`}
                                  disabled={i === 0}
                                  className="px-2"
                                >
                                  <Icon name="arrow-up" size={16} />
                                </Button>
                              </WorkspaceForm>
                              <WorkspaceForm
                                action={moveLessonAction.bind(
                                  null,
                                  course.id,
                                  lesson.id,
                                  1,
                                )}
                              >
                                <input
                                  type="hidden"
                                  name="revision"
                                  value={course.contentRevision}
                                />
                                <Button
                                  variant="ghost"
                                  type="submit"
                                  aria-label={`Move ${lesson.title} down`}
                                  disabled={i === items.length - 1}
                                  className="px-2"
                                >
                                  <Icon name="arrow-down" size={16} />
                                </Button>
                              </WorkspaceForm>
                            </div>
                          </div>
                          {video ? (
                            <div className="mt-2">
                              <Chip
                                variant={
                                  video.ingestionStatus === "READY"
                                    ? "success"
                                    : video.ingestionStatus === "FAILED"
                                      ? "destructive"
                                      : "warning"
                                }
                              >
                                Video {statusLabel(video.ingestionStatus).label.toLowerCase()}
                              </Chip>
                              {video.ingestionStatus !== "READY" && editable ? (
                                <details className="mt-2">
                                  <summary className="touch-target flex items-center text-sm text-link">
                                    Retry video processing
                                  </summary>
                                  <p className="my-3 text-sm text-muted">
                                    The transcript could not be prepared.
                                    Correct the transcript below, or leave it
                                    blank to retry the saved transcript or
                                    configured service.
                                  </p>
                                  {video.failureReason ? (
                                    <p className="mb-3 break-words text-sm text-destructive-text">
                                      {video.failureReason}
                                    </p>
                                  ) : null}
                                  <WorkspaceForm
                                    action={retryIngestAction.bind(
                                      null,
                                      course.id,
                                      video.id,
                                    )}
                                  >
                                    <input
                                      type="hidden"
                                      name="revision"
                                      value={course.contentRevision}
                                    />
                                    <Field
                                      label="Replacement transcript (SRT or VTT)"
                                      hint="Use captions you have permission to use. Include timestamps and caption text."
                                    >
                                      <Textarea name="transcript" rows={5} />
                                    </Field>
                                    <SubmitButton variant="secondary">
                                      Retry processing
                                    </SubmitButton>
                                  </WorkspaceForm>
                                </details>
                              ) : null}
                            </div>
                          ) : null}
                          {lesson.type === "INTERVIEW" && editable ? (
                            <details className="mt-2">
                              <summary className="touch-target flex items-center text-sm text-link">
                                Edit oral check settings
                              </summary>
                              <WorkspaceForm
                                action={updateInterviewLessonAction.bind(
                                  null,
                                  course.id,
                                  lesson.id,
                                )}
                              >
                                <input
                                  type="hidden"
                                  name="revision"
                                  value={course.contentRevision}
                                />
                                <Field label="Oral check title">
                                  <Input
                                    name="title"
                                    defaultValue={lesson.title}
                                    required
                                  />
                                </Field>
                                <InterviewFields
                                  cfg={parseInterviewConfig(
                                    lesson.payload.interview,
                                  )}
                                />
                                <Button type="submit" variant="secondary">
                                  Save oral check
                                </Button>
                              </WorkspaceForm>
                            </details>
                          ) : null}
                          {editable && ["TEXT", "PDF"].includes(lesson.type) ? (
                            <details className="mt-3">
                              <summary className="touch-target flex items-center text-sm text-link">
                                Edit lesson content
                              </summary>
                              <WorkspaceForm
                                action={updateContentLessonAction.bind(
                                  null,
                                  course.id,
                                  lesson.id,
                                )}
                              >
                                <input
                                  type="hidden"
                                  name="revision"
                                  value={course.contentRevision}
                                />
                                <Field label="Lesson title">
                                  <Input
                                    name="title"
                                    defaultValue={lesson.title}
                                    required
                                  />
                                </Field>
                                {lesson.type === "TEXT" ? (
                                  <Field label="Lesson content">
                                    <Textarea
                                      name="body"
                                      defaultValue={lesson.payload.body ?? ""}
                                      rows={8}
                                      required
                                    />
                                  </Field>
                                ) : (
                                  <Field label="PDF file URL">
                                    <Input
                                      name="fileUrl"
                                      defaultValue={
                                        lesson.payload.fileUrl ?? ""
                                      }
                                      required
                                    />
                                  </Field>
                                )}
                                <Button type="submit" variant="secondary">
                                  Save lesson content
                                </Button>
                              </WorkspaceForm>
                            </details>
                          ) : null}
                          <details className="mt-3">
                            <summary className="touch-target flex items-center text-sm text-link">
                              Review lesson content
                            </summary>
                            <div className="py-4">
                              <CourseLessonPreview lesson={lesson} />
                            </div>
                          </details>
                        </li>
                      );
                    })}
                    {!items.length ? (
                      <li className="py-3 text-sm text-muted">
                        Add the first lesson to this module.
                      </li>
                    ) : null}
                  </ol>
                  <details
                    hidden={!editable}
                    className="border-t border-border pt-3"
                  >
                    <summary className="touch-target flex items-center font-medium text-link">
                      Add lesson to {mod.title}
                    </summary>
                    <LessonForm
                      courseId={course.id}
                      moduleId={mod.id}
                      banks={banks}
                      revision={course.contentRevision}
                    />
                  </details>
                </WorkspaceSection>
              );
            })}
            {editable ? (
              <WorkspaceSection
                title="Add a module"
                description="Group related lessons under a clear title."
              >
                <WorkspaceForm action={addModuleAction.bind(null, course.id)}>
                  <input
                    type="hidden"
                    name="revision"
                    value={course.contentRevision}
                  />
                  <Field label="New module title">
                    <Input name="title" required />
                  </Field>
                  <Button type="submit" variant="secondary">
                    Add module
                  </Button>
                </WorkspaceForm>
              </WorkspaceSection>
            ) : null}
          </div>
        ) : (
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <WorkspaceSection title="Course settings">
              {!editable ? (
                <p role="status" className="mb-4 flex items-start gap-2 rounded-control bg-surface-2 p-3 text-sm text-foreground">
                  <Icon name="warning" size={16} className="mt-1 shrink-0 text-muted" />
                  {course.status === "PUBLISHED"
                    ? "Published. Revise this course to make changes."
                    : course.approvalState === "SUBMITTED"
                      ? "Waiting for Department Head review. Withdraw the submission to make changes."
                      : "Only the course's instructor can change these settings."}
                </p>
              ) : null}
              <WorkspaceForm action={updateCourseAction.bind(null, course.id)}>
                <input
                  type="hidden"
                  name="revision"
                  value={course.contentRevision}
                />
                <Field label="Course title">
                  <Input name="title" defaultValue={course.title} required />
                </Field>
                <Field label="Description">
                  <Textarea
                    name="description"
                    rows={5}
                    defaultValue={course.description}
                  />
                </Field>
                <CoverUrlField defaultValue={course.coverUrl ?? ""} title={course.title} tags={course.tags} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Estimated minutes">
                    <Input
                      name="estMinutes"
                      type="number"
                      min={1}
                      defaultValue={course.estMinutes}
                      required
                    />
                  </Field>
                  <Field label="Language">
                    <Select name="language" defaultValue={course.language} required>
                      {[...new Set(["en", "ar", "hi", "ml", course.language])].map((code) => (
                        <option key={code} value={code}>
                          {languageName(code)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Tags" hint="Separate topics with commas.">
                  <Input name="tags" defaultValue={course.tags.join(", ")} />
                </Field>
                <CoursePlanningFields
                  key={`${course.id}:${course.contentRevision}`}
                  startDate={course.startsAt ? localDate(course.startsAt) : ""}
                  endDate={course.endsAt ? localDate(course.endsAt) : ""}
                  folderPath={course.folderPath}
                  choices={prerequisiteChoices}
                  initialIds={selectedIds}
                  folderOptions={folderOptions}
                />
                <fieldset className="mb-4 border-t border-border pt-4">
                  <legend className="font-semibold">
                    Completion and certificates
                  </legend>
                  <label className="touch-target flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="sequentialLock"
                      defaultChecked={course.sequentialLock}
                    />
                    Complete lessons in order
                  </label>
                  <label className="touch-target mb-3 flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="certificateEnabled"
                      defaultChecked={course.certificateEnabled}
                    />
                    Issue certificate on completion
                  </label>
                  <Field
                    label="Certificate validity (days)"
                    hint="Leave blank for a certificate that never expires."
                  >
                    <Input
                      name="certificateValidityDays"
                      type="number"
                      min={1}
                      defaultValue={course.certificateValidityDays ?? ""}
                    />
                  </Field>
                </fieldset>
                {["HR_HEAD", "ADMIN"].includes(actor.role) ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Department">
                      <Select
                        name="departmentId"
                        defaultValue={course.departmentId ?? ""}
                      >
                        <option value="">Unassigned</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Instructor">
                      <Select
                        name="instructorId"
                        defaultValue={course.instructorId ?? ""}
                      >
                        <option value="">Unassigned</option>
                        {instructors.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : null}
                <Button type="submit">Save settings</Button>
              </WorkspaceForm>
            </WorkspaceSection>
            <aside className="min-w-0">
              <div className="overflow-hidden rounded-card border border-border bg-surface">
                <CourseCover
                  title={course.title}
                  coverUrl={course.coverUrl}
                  tags={course.tags}
                />
                <div className="p-4">
                  <h2 className="font-semibold">Course cover</h2>
                  <p className="mt-2 text-sm text-muted">
                    This saved cover appears in the catalog and on the learner
                    course page. A missing or broken image uses the subject
                    illustration.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        )}
      </fieldset>
    </div>
  );
}
