import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Button, Chip, Field, Input, PageHeader, Textarea, Icon } from "@/components/ui";
import { WorkspaceLink, WorkspaceTabs, WorkspaceSection } from "@/components/workspace-ui";
import { WorkspaceForm, SubmitButton } from "@/components/workspace-form";
import { CourseCover } from "@/components/course-cover";
import { LessonIcon } from "@/components/lesson-icon";
import type { LessonType } from "@/lib/lms/outline";
import { parseInterviewConfig } from "@/lib/live/interview";
import { LessonForm, InterviewFields } from "../lesson-form";
import { updateCourseAction, setCourseStatusAction, addModuleAction, updateInterviewLessonAction, retryIngestAction, moveLessonAction } from "../actions";
export const dynamic = "force-dynamic";
export default async function CourseEditorPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ view?: string }> }) {
  await requireRole("ADMIN");
  const { courseId } = await params; const view = (await searchParams).view === "settings" ? "settings" : "curriculum";
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId)).limit(1); if (!course) notFound();
  const mods = (await db.select().from(t.modules).where(eq(t.modules.courseId, courseId))).sort((a,b) => a.sort - b.sort);
  const lessons = mods.length ? await db.select().from(t.lessons).where(inArray(t.lessons.moduleId, mods.map(m => m.id))) : [];
  const videoIds = lessons.flatMap(l => l.payload.videoId ? [l.payload.videoId] : []);
  const videos = videoIds.length ? await db.select().from(t.videos).where(inArray(t.videos.id, videoIds)) : [];
  const banks = await db.select().from(t.questionBanks);
  return <div className="min-w-0">
    <a href="/admin/courses" className="link mb-4 inline-flex touch-target items-center">← All courses</a>
    <PageHeader title={course.title} sub={`${mods.length} module${mods.length === 1 ? "" : "s"} · ${lessons.length} lesson${lessons.length === 1 ? "" : "s"} · ${course.estMinutes} min`} actions={<>
      <Chip variant={course.status === "PUBLISHED" ? "success" : "warning"}>{course.status.toLowerCase()}</Chip>
      {course.status === "PUBLISHED" ? <WorkspaceLink href={`/course/${course.id}`}>View learner course</WorkspaceLink> : null}
      <WorkspaceForm action={setCourseStatusAction.bind(null, course.id, course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}><SubmitButton variant="secondary">{course.status === "PUBLISHED" ? "Unpublish" : "Publish"}</SubmitButton></WorkspaceForm>
    </>} />
    <WorkspaceTabs label="Course editor" items={[{ href: `/admin/courses/${course.id}`, label: "Curriculum", active: view === "curriculum" }, { href: `/admin/courses/${course.id}?view=settings`, label: "Settings", active: view === "settings" }]} />
    {view === "curriculum" ? <div className="max-w-4xl space-y-6">
      <p className="mb-4 text-sm text-muted">Build your modules in learning order. {course.sequentialLock ? "Learners must complete lessons in order." : "Learners can choose their lesson order."} {course.status !== "PUBLISHED" ? "Publish when the course is ready to make it available to learners." : "Changes to this published course are visible to learners."}</p>
      {mods.map((mod, index) => {
        const items = lessons.filter(l => l.moduleId === mod.id).sort((a,b) => a.sort - b.sort);
        return <WorkspaceSection key={mod.id} title={mod.title} description={`Module ${index + 1} · ${items.length} lesson${items.length === 1 ? "" : "s"}`}>
          <ol className="mb-4 divide-y divide-border">{items.map((lesson, i) => {
            const video = videos.find(v => v.id === lesson.payload.videoId);
            return <li key={lesson.id} className="min-w-0 py-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><LessonIcon type={lesson.type as LessonType} /><div className="min-w-0 flex-1"><p className="break-words font-medium">{lesson.title}</p><p className="text-sm text-muted">{lesson.type.toLowerCase()}</p></div><div className="flex shrink-0 gap-1"><WorkspaceForm action={moveLessonAction.bind(null, course.id, lesson.id, -1)}><Button variant="ghost" type="submit" aria-label={`Move ${lesson.title} up`} disabled={i === 0} className="px-2"><Icon name="arrow-up" size={16} /></Button></WorkspaceForm><WorkspaceForm action={moveLessonAction.bind(null, course.id, lesson.id, 1)}><Button variant="ghost" type="submit" aria-label={`Move ${lesson.title} down`} disabled={i === items.length - 1} className="px-2"><Icon name="arrow-down" size={16} /></Button></WorkspaceForm></div></div>
              {video ? <div className="mt-2"><Chip variant={video.ingestionStatus === "READY" ? "success" : video.ingestionStatus === "FAILED" ? "destructive" : "warning"}>Video {video.ingestionStatus.toLowerCase()}</Chip>{video.ingestionStatus === "FAILED" ? <details className="mt-2"><summary className="touch-target flex items-center text-sm text-link">Retry video ingestion</summary><p className="my-3 text-sm text-muted">The transcript could not be prepared. Correct the transcript below, or leave it blank to retry the saved transcript or configured service.</p>{video.failureReason ? <p className="mb-3 break-words text-sm text-destructive-text">{video.failureReason}</p> : null}<WorkspaceForm action={retryIngestAction.bind(null, course.id, video.id)}><Field label="Replacement transcript (SRT or VTT)" hint="Use captions you have permission to use. Include timestamps and caption text."><Textarea name="transcript" rows={5} /></Field><SubmitButton variant="secondary">Retry ingestion</SubmitButton></WorkspaceForm></details> : null}</div> : null}
              {lesson.type === "INTERVIEW" ? <details className="mt-2"><summary className="touch-target flex items-center text-sm text-link">Edit oral check settings</summary><WorkspaceForm action={updateInterviewLessonAction.bind(null, course.id, lesson.id)}><Field label="Oral check title"><Input name="title" defaultValue={lesson.title} required /></Field><InterviewFields cfg={parseInterviewConfig(lesson.payload.interview)} /><Button type="submit" variant="secondary">Save oral check</Button></WorkspaceForm></details> : null}
            </li>;
          })}{!items.length ? <li className="py-3 text-sm text-muted">Add the first lesson to this module.</li> : null}</ol>
          <details className="border-t border-border pt-3"><summary className="touch-target flex items-center font-medium text-link">Add lesson to {mod.title}</summary><LessonForm courseId={course.id} moduleId={mod.id} banks={banks} /></details>
        </WorkspaceSection>;
      })}
      <WorkspaceSection title="Add a module" description="Group related lessons under a clear title."><WorkspaceForm action={addModuleAction.bind(null, course.id)}><Field label="New module title"><Input name="title" required /></Field><Button type="submit" variant="secondary">Add module</Button></WorkspaceForm></WorkspaceSection>
    </div> : <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><WorkspaceSection title="Course settings"><WorkspaceForm action={updateCourseAction.bind(null, course.id)}>
      <Field label="Course title"><Input name="title" defaultValue={course.title} required /></Field><Field label="Description"><Textarea name="description" rows={5} defaultValue={course.description} /></Field><Field label="Cover image URL" hint="An HTTPS image URL or a local / path. Leave blank to use the subject illustration."><Input name="coverUrl" defaultValue={course.coverUrl ?? ""} /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Estimated minutes"><Input name="estMinutes" type="number" min={1} defaultValue={course.estMinutes} required /></Field><Field label="Language code" hint="For example en, ar, hi or ml"><Input name="language" defaultValue={course.language} required /></Field></div><Field label="Tags" hint="Separate topics with commas."><Input name="tags" defaultValue={course.tags.join(", ")} /></Field>
      <fieldset className="mb-4 border-t border-border pt-4"><legend className="font-semibold">Completion and certificates</legend><label className="touch-target flex items-center gap-3 text-sm"><input type="checkbox" name="sequentialLock" defaultChecked={course.sequentialLock} />Complete lessons in order</label><label className="touch-target mb-3 flex items-center gap-3 text-sm"><input type="checkbox" name="certificateEnabled" defaultChecked={course.certificateEnabled} />Issue certificate on completion</label><Field label="Certificate validity (days)" hint="Leave blank for a certificate that never expires."><Input name="certificateValidityDays" type="number" min={1} defaultValue={course.certificateValidityDays ?? ""} /></Field></fieldset><Button type="submit">Save settings</Button>
    </WorkspaceForm></WorkspaceSection><aside className="min-w-0"><div className="overflow-hidden rounded-card border border-border bg-surface"><CourseCover title={course.title} coverUrl={course.coverUrl} tags={course.tags} /><div className="p-4"><h2 className="font-semibold">Course cover</h2><p className="mt-2 text-sm text-muted">This saved cover appears in the catalog and on the learner course page. A missing or broken image uses the subject illustration.</p></div></div></aside></div>}
  </div>;
}
