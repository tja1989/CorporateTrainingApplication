import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { myCourses, recommend } from "@/lib/lms/queries";
import { buildCourseOutline } from "@/lib/lms/course-outline";
import { pathPrerequisite } from "@/lib/lms/path-access";
import { flatLessons } from "@/lib/lms/outline";
import { CourseCover } from "@/components/course-cover";
import { CourseCard, LearningProgress } from "@/components/course-card";
import { Card, Chip, PageHeader, complianceChip, ButtonLink, EmptyState, DemoBanner } from "@/components/ui";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const user = await requireUser();
  const mine = await myCourses(user.id);
  const pathLocks = await Promise.all(mine.map(c => pathPrerequisite(user.id, c.course.id)));
  const available = mine.filter((_, index) => !pathLocks[index]);
  const allAssignedDone = mine.length > 0 && mine.every(c => c.pct === 100);
  const candidates = [...available.filter(c => c.enrollment?.status === "IN_PROGRESS"), ...available.filter(c => c.enrollment?.status === "NOT_STARTED")];
  const outlines = await Promise.all(candidates.map(c => buildCourseOutline({ courseId: c.course.id, userId: user.id, sequentialLock: c.course.sequentialLock })));
  const resumeIndex = outlines.findIndex(o => !!o.nextLessonId);
  const resume = candidates[resumeIndex];
  const outline = outlines[resumeIndex];
  const next = outline ? flatLessons(outline).find(l => l.id === outline.nextLessonId) : null;
  const due = mine.filter(c => ["DUE_SOON", "OVERDUE"].includes(c.enrollment?.complianceStatus ?? "")).sort((a, b) => (a.enrollment?.dueAt?.getTime() ?? Infinity) - (b.enrollment?.dueAt?.getTime() ?? Infinity));
  const recs = recommend(available).filter(r => r.course.id !== resume?.course.id);
  const [paths, links] = await Promise.all([db.select().from(t.paths), db.select().from(t.pathCourses)]);
  const ids = new Set(mine.map(c => c.course.id));
  const myPaths = paths.filter(p => links.some(l => l.pathId === p.id && ids.has(l.courseId)));
  return <div><DemoBanner /><PageHeader title={`Welcome back, ${user.name.split(" ")[0]}`} sub="Your next step in learning." />
    {resume && next ? <section aria-labelledby="continue-heading" className="mb-8"><h2 id="continue-heading" className="mb-3 text-xl font-semibold">Continue learning</h2><Card className="overflow-hidden md:grid md:grid-cols-[minmax(240px,1fr)_2fr]"><CourseCover title={resume.course.title} coverUrl={resume.course.coverUrl} tags={resume.course.tags} priority className="h-full" /><div className="p-5 sm:p-6"><p className="mb-2 text-sm text-muted">{resume.course.title}</p><h3 className="mb-3 text-xl font-semibold">{next.title}</h3><p className="mb-4 text-sm text-muted">{next.type.toLowerCase()} lesson{next.minutes ? ` · about ${next.minutes} min` : ""}</p><LearningProgress pct={outline.pct} label={`${outline.doneCount} of ${outline.total} lessons complete`} /><div className="mt-5"><ButtonLink href={next.href}>Continue lesson</ButtonLink></div></div></Card></section> : <EmptyState title={allAssignedDone ? "Your assigned learning is complete" : mine.length ? "Your next lesson is not available yet" : "Your learning starts here"} body={allAssignedDone ? "Explore more courses or revisit completed training in My Learning." : mine.length ? "Check your learning paths for prerequisites, or contact your training team if a course is still being prepared." : "Assigned training will appear here. You can explore published courses now."} action={<ButtonLink href="/learn?view=browse">Browse courses</ButtonLink>} />}
    {due.length ? <section className="mb-8" aria-labelledby="required-heading"><h2 id="required-heading" className="mb-3 text-xl font-semibold">Required training due soon</h2><div className="divide-y divide-border rounded-card border border-border bg-surface">{due.map(c => { const chip = complianceChip(c.enrollment!.complianceStatus); return <Link key={c.course.id} href={`/course/${c.course.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-2"><div><h3 className="font-medium">{c.course.title}</h3><p className="text-sm text-muted">{c.enrollment?.dueAt ? `Due ${c.enrollment.dueAt.toISOString().slice(0, 10)}` : "Assigned training"}</p></div><Chip variant={chip.variant}>{chip.label}</Chip></Link>; })}</div></section> : null}
    {myPaths.length ? <section className="mb-8" aria-labelledby="paths-heading"><h2 id="paths-heading" className="mb-3 text-xl font-semibold">Your learning paths</h2><div className="divide-y divide-border rounded-card border border-border bg-surface">{myPaths.map(p => <Link key={p.id} href={`/path/${p.id}`} className="block p-4 hover:bg-surface-2"><h3 className="font-medium">{p.title}</h3><p className="text-sm text-muted">{p.description}</p></Link>)}</div></section> : null}
    {recs.length ? <section className="mb-8" aria-labelledby="recommended-heading"><h2 id="recommended-heading" className="mb-3 text-xl font-semibold">Recommended for you</h2><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{recs.map(r => <CourseCard key={r.course.id} course={r.course} reason={r.reason} />)}</div></section> : null}
    <section className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-5" aria-label="Optional practice"><div><h2 className="text-lg font-semibold">Keep your knowledge fresh</h2><p className="text-sm text-muted">Optional daily practice unlocks after your first completed lesson.</p></div><ButtonLink variant="secondary" href="/drill">Open Practice</ButtonLink></section>
  </div>;
}
