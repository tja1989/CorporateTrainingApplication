import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { courseProgress } from "@/lib/lms/queries";
import { buildCourseOutline } from "@/lib/lms/course-outline";
import { CourseCover } from "@/components/course-cover";
import { LearningProgress } from "@/components/course-card";
import { Card, Chip, PageTitle, ButtonLink, EmptyState } from "@/components/ui";
export const dynamic = "force-dynamic";
export default async function PathPage({ params }: { params: Promise<{ pathId: string }> }) {
  const user = await requireUser();
  const { pathId } = await params;
  const [path] = await db.select().from(t.paths).where(eq(t.paths.id, pathId)).limit(1);
  if (!path) notFound();
  const links = (await db.select().from(t.pathCourses).where(eq(t.pathCourses.pathId, pathId))).sort((a, b) => a.sort - b.sort);
  const courses = links.length ? await db.select().from(t.courses).where(inArray(t.courses.id, links.map(l => l.courseId))) : [];
  const progress = await courseProgress(user.id, links.map(l => l.courseId));
  let previousDone = true;
  const steps = links.flatMap(link => { const course = courses.find(c => c.id === link.courseId); if (!course) return []; const p = progress.get(course.id) ?? { total: 0, done: 0 }; const complete = p.total > 0 && p.done === p.total; const locked = path.completeInOrder && !previousDone; previousDone = previousDone && complete; return [{ course, ...p, complete, locked }]; });
  const done = steps.filter(s => s.complete).length;
  const current = steps.find(s => !s.complete && !s.locked && s.course.status === "PUBLISHED");
  const outline = current ? await buildCourseOutline({ courseId: current.course.id, userId: user.id, sequentialLock: current.course.sequentialLock }) : null;
  return <div><PageTitle sub={path.description}>{path.title}</PageTitle><div className="mb-8 max-w-xl"><LearningProgress pct={steps.length ? Math.round(done / steps.length * 100) : 0} label={`${done} of ${steps.length} courses complete`} /><p className="mt-3 text-sm text-muted">{path.completeInOrder ? "Complete each course to unlock the next step in this path." : "Take these courses in any order."}</p>{current ? <div className="mt-4"><ButtonLink href={outline?.nextLessonId ? `/lesson/${outline.nextLessonId}` : `/course/${current.course.id}`}>Continue path</ButtonLink></div> : null}</div>
    {steps.length ? <ol className="flex flex-col gap-4">{steps.map((s, i) => <li key={s.course.id}><Card className="overflow-hidden sm:grid sm:grid-cols-[180px_minmax(0,1fr)]"><CourseCover title={s.course.title} coverUrl={s.course.coverUrl} tags={s.course.tags} /><div className="p-4"><p className="mb-1 text-sm text-muted">Course {i + 1} of {steps.length}</p><div className="mb-2 flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{s.locked || s.course.status !== "PUBLISHED" ? s.course.title : <Link className="hover:underline" href={`/course/${s.course.id}`}>{s.course.title}</Link>}</h2><Chip variant={s.complete ? "success" : s.locked ? "neutral" : "accent"}>{s.complete ? "Completed" : s.locked ? "Locked" : s === current ? "Current step" : "Available"}</Chip></div><p className="text-sm text-muted">{s.done}/{s.total} lessons · {s.course.estMinutes} min</p>{s.locked ? <p className="mt-2 text-sm text-muted">Finish the earlier courses in this path to unlock this step.</p> : s.course.status !== "PUBLISHED" ? <p className="mt-2 text-sm text-muted">This course is being prepared. Contact your manager if you need it now.</p> : null}</div></Card></li>)}</ol> : <EmptyState title="This path is being prepared" body="Courses will appear here when your training team adds them." />}
  </div>;
}
