import { Icon } from "@/components/icons";
import { LessonIcon } from "@/components/lesson-icon";
import type { LessonType } from "@/lib/lms/outline";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { Button, Card, Chip, Field, Input, PageTitle, Select, Textarea, cx } from "@/components/ui";
import {
  updateCourseAction,
  setCourseStatusAction,
  addModuleAction,
  addLessonAction,
  updateInterviewLessonAction,
  retryIngestAction,
  moveLessonAction,
} from "../actions";

import { parseInterviewConfig } from "@/lib/live/interview";
import type { InterviewConfig } from "@/lib/db/schema";

export const dynamic = "force-dynamic";


export default async function CourseEditorPage({ params }: { params: Promise<{ courseId: string }> }) {
  await requireRole("ADMIN");
  const { courseId } = await params;
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId)).limit(1);
  if (!course) notFound();
  const mods = (await db.select().from(t.modules).where(eq(t.modules.courseId, courseId))).sort((a, b) => a.sort - b.sort);
  const lessonRows = mods.length ? await db.select().from(t.lessons).where(inArray(t.lessons.moduleId, mods.map((m) => m.id))) : [];
  const videoIds = lessonRows.map((l) => l.payload.videoId).filter((v): v is string => !!v);
  const videoRows = videoIds.length ? await db.select().from(t.videos).where(inArray(t.videos.id, videoIds)) : [];
  const videoOf = new Map(videoRows.map((v) => [v.id, v]));
  const banks = await db.select().from(t.questionBanks);

  return (
    <div className="animate-slide-up">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PageTitle>{course.title}</PageTitle>
        <Chip variant={course.status === "PUBLISHED" ? "success" : "warning"}>{course.status.toLowerCase()}</Chip>
        <form action={setCourseStatusAction.bind(null, course.id, course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}>
          <Button type="submit" variant="secondary">{course.status === "PUBLISHED" ? "Unpublish" : "Publish"}</Button>
        </form>
      </div>

      <div className="grid max-w-6xl gap-6 lg:grid-cols-[3fr_2fr]">
        <div>
          {mods.map((mod) => {
            const lessons = lessonRows.filter((l) => l.moduleId === mod.id).sort((a, b) => a.sort - b.sort);
            return (
              <Card key={mod.id} className="mb-4 p-4">
                <h2 className="mb-2 font-medium">{mod.title}</h2>
                <ul className="mb-3 flex flex-col gap-1">
                  {lessons.map((lesson, i) => {
                    const video = lesson.payload.videoId ? videoOf.get(lesson.payload.videoId) : null;
                    return (
                      <li key={lesson.id} className="rounded-control bg-surface-2 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                        <LessonIcon type={lesson.type as LessonType} />
                        <span className="flex-1 truncate">{lesson.title}</span>
                        {video ? (
                          <span className="flex items-center gap-2">
                            <Chip variant={video.ingestionStatus === "READY" ? "success" : video.ingestionStatus === "FAILED" ? "destructive" : "warning"}>
                              {video.ingestionStatus.toLowerCase()}
                            </Chip>
                            {video.ingestionStatus === "FAILED" ? (
                              <form action={retryIngestAction.bind(null, course.id, video.id)}>
                                <button type="submit" className="link text-xs text-link">retry</button>
                              </form>
                            ) : null}
                          </span>
                        ) : null}
                        <form action={moveLessonAction.bind(null, course.id, lesson.id, -1)}>
                          <button aria-label="Move up" className={cx("touch-target rounded-control px-1 hover:bg-surface", i === 0 && "opacity-30")} disabled={i === 0}><Icon name="arrow-up" size={16} /></button>
                        </form>
                        <form action={moveLessonAction.bind(null, course.id, lesson.id, 1)}>
                          <button aria-label="Move down" className={cx("touch-target rounded-control px-1 hover:bg-surface", i === lessons.length - 1 && "opacity-30")} disabled={i === lessons.length - 1}><Icon name="arrow-down" size={16} /></button>
                        </form>
                        </div>
                        {lesson.type === "INTERVIEW" ? (() => {
                          const cfg = parseInterviewConfig(lesson.payload.interview);
                          return (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-link">
                                Oral check · {cfg.questionCount} questions · pass {cfg.passPct}% · scope: {cfg.scope}{cfg.requirePass ? " · pass required" : ""}
                              </summary>
                              <form action={updateInterviewLessonAction.bind(null, course.id, lesson.id)} className="mt-2">
                                <Field label="Title"><Input name="title" defaultValue={lesson.title} /></Field>
                                <InterviewFields cfg={cfg} />
                                <Button type="submit" variant="secondary">Save oral check</Button>
                              </form>
                            </details>
                          );
                        })() : null}
                      </li>
                    );
                  })}
                  {lessons.length === 0 ? <li className="text-sm text-muted">No lessons yet.</li> : null}
                </ul>

                <details>
                  <summary className="cursor-pointer text-sm font-medium text-link">+ Add lesson</summary>
                  <form action={addLessonAction.bind(null, course.id, mod.id)} className="mt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Type">
                        <Select name="type" defaultValue="TEXT">
                          <option value="TEXT">Text</option>
                          <option value="PDF">PDF</option>
                          <option value="VIDEO">YouTube video</option>
                          <option value="QUIZ">Quiz</option>
                          <option value="INTERVIEW">Interview (voice oral check)</option>
                        </Select>
                      </Field>
                      <Field label="Title"><Input name="title" required /></Field>
                    </div>
                    <Field label="TEXT: markdown body"><Textarea name="body" rows={4} /></Field>
                    <Field label="PDF: file URL"><Input name="fileUrl" placeholder="/demo/… or https://…" /></Field>
                    <Field label="VIDEO: YouTube URL or ID" hint="Public or unlisted, embeddable. Paste an SRT/VTT transcript below (lawful manual path) or leave empty to use the vendor fetcher (demo only).">
                      <Input name="youtubeUrl" placeholder="https://www.youtube.com/watch?v=…" />
                    </Field>
                    <Field label="VIDEO: transcript (SRT/VTT)"><Textarea name="transcript" rows={3} placeholder="1\n00:00:00,000 --> 00:00:05,000\n…" /></Field>
                    <div className="grid grid-cols-3 items-end gap-3">
                      <Field label="QUIZ: draw from bank">
                        <Select name="bankId" defaultValue="">
                          <option value="">— none —</option>
                          {banks.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Pick N"><Input name="pickN" type="number" defaultValue={5} min={1} /></Field>
                      <div className="mb-4 flex flex-col gap-1 text-sm">
                        <label className="flex items-center gap-2"><input type="checkbox" name="exam" /> Exam mode</label>
                        <label className="flex items-center gap-2"><input type="checkbox" name="integrity" /> Integrity monitoring</label>
                      </div>
                    </div>
                    <fieldset className="mb-3 rounded-control border border-border p-3">
                      <legend className="px-1 text-xs text-muted">INTERVIEW: oral check settings (ignored for other types)</legend>
                      <InterviewFields />
                    </fieldset>
                    <Button type="submit">Add lesson</Button>
                  </form>
                </details>
              </Card>
            );
          })}

          <Card className="p-4">
            <form action={addModuleAction.bind(null, course.id)} className="flex items-end gap-2">
              <Field label="New module title"><Input name="title" required /></Field>
              <Button type="submit" variant="secondary" className="mb-4">Add module</Button>
            </form>
          </Card>
        </div>

        <Card className="h-fit p-4">
          <h2 className="eyebrow mb-2 text-muted">Course settings</h2>
          <form action={updateCourseAction.bind(null, course.id)}>
            <Field label="Title"><Input name="title" defaultValue={course.title} /></Field>
            <Field label="Description"><Textarea name="description" rows={2} defaultValue={course.description} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Est. minutes"><Input name="estMinutes" type="number" defaultValue={course.estMinutes} /></Field>
              <Field label="Tags (comma-sep)"><Input name="tags" defaultValue={course.tags.join(", ")} /></Field>
            </div>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="sequentialLock" defaultChecked={course.sequentialLock} /> Complete lessons in order
            </label>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="certificateEnabled" defaultChecked={course.certificateEnabled} /> Issue certificate
            </label>
            <Field label="Certificate validity (days, blank = never expires)">
              <Input name="certificateValidityDays" type="number" defaultValue={course.certificateValidityDays ?? ""} />
            </Field>
            <Button type="submit">Save settings</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

/** Oral-check settings (spec FR-14.2 v1.4) — shared by "Add lesson" and the inline editor. */
function InterviewFields({ cfg }: { cfg?: InterviewConfig }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Field label="Questions (1–6)"><Input name="questionCount" type="number" min={1} max={6} defaultValue={cfg?.questionCount ?? 3} /></Field>
      <Field label="Pass mark %"><Input name="passPct" type="number" min={50} max={100} defaultValue={cfg?.passPct ?? 67} /></Field>
      <Field label="Max minutes (3–9)"><Input name="maxMinutes" type="number" min={3} max={9} defaultValue={cfg?.maxMinutes ?? 6} /></Field>
      <Field label="Ask about" hint="Which lesson content the interviewer may use">
        <Select name="scope" defaultValue={cfg?.scope ?? "module"}>
          <option value="previous">The previous lesson</option>
          <option value="module">Lessons in this module</option>
          <option value="course">Everything in the course</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Focus (optional)" hint="Topics or instructions for the interviewer, e.g. “the LAST complaint method”">
          <Textarea name="focus" rows={2} defaultValue={cfg?.focus ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="requirePass" defaultChecked={cfg?.requirePass ?? true} /> Passing is required to complete this lesson
      </label>
    </div>
  );
}
