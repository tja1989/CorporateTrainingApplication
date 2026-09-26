import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { myCourses } from "@/lib/lms/queries";
import { parseCatalogQuery, filterCatalog, catalogHref, type CatalogParams } from "@/lib/lms/catalog";
import { CatalogFilters } from "@/components/catalog-filters";
import { CourseCard } from "@/components/course-card";
import { Button, ButtonLink, Card, Chip, Field, Input, Select, PageTitle, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function LearnPage({ searchParams }: { searchParams: Promise<CatalogParams> }) {
  const user = await requireUser();
  const query = parseCatalogQuery(await searchParams);
  const [mine, catalog, paths, links] = await Promise.all([myCourses(user.id), db.select().from(t.courses).where(eq(t.courses.status, "PUBLISHED")), db.select().from(t.paths), db.select().from(t.pathCourses)]);
  const enrolled = new Map(mine.map(m => [m.course.id, m.enrollment?.status ?? "NOT_STARTED"]));
  const result = filterCatalog(catalog, enrolled, query);
  const tags = [...new Set(catalog.flatMap(c => c.tags))].sort();
  const languages = [...new Set(catalog.map(c => c.language))].sort();
  const myPaths = paths.filter(p => links.some(l => l.pathId === p.id && enrolled.has(l.courseId)));
  const progress = new Map(mine.map(m => [m.course.id, m]));
  return <div>
    <PageTitle sub="Pick up your training or find your next course.">My Learning</PageTitle>
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3" aria-label="Learning views">
      {([['mine', 'My courses'], ['paths', 'Learning paths'], ['browse', 'Browse courses']] as const).map(([view, label]) => <ButtonLink key={view} variant={query.view === view ? "primary" : "ghost"} aria-current={query.view === view ? "page" : undefined} href={`/learn?view=${view}`}>{label}</ButtonLink>)}
    </nav>
    {query.view === "paths" ? <section aria-label="Learning paths">{myPaths.length ? <div className="flex flex-col gap-4">{myPaths.map(path => { const courseLinks = links.filter(l => l.pathId === path.id); const complete = courseLinks.filter(l => progress.get(l.courseId)?.pct === 100).length; return <Link key={path.id} href={`/path/${path.id}`}><Card className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-surface-2"><div><h2 className="mb-1 text-lg font-semibold">{path.title}</h2><p className="text-sm text-muted">{path.description}</p><p className="mt-2 text-sm text-muted">{complete} of {courseLinks.length} courses complete</p></div><Chip variant="neutral">{path.completeInOrder ? "Complete in order" : "Any order"}</Chip></Card></Link>; })}</div> : <EmptyState title="No learning paths assigned" body="Your assigned learning paths will appear here. You can still explore the course catalog." action={<ButtonLink href="/learn?view=browse">Browse courses</ButtonLink>} />}</section> : <>
      <form key={catalogHref(query)} className="mb-6 rounded-card border border-border bg-surface p-4" action="/learn" method="get" role="search" aria-label="Filter courses">
        <input type="hidden" name="view" value={query.view} />
        <div className="flex flex-wrap items-end gap-3"><div className="w-full min-w-0 md:w-auto md:flex-1"><Field label="Search courses"><Input name="q" defaultValue={query.q} placeholder="Course title or topic" /></Field></div><Button type="submit">Apply filters</Button><ButtonLink variant="ghost" href={`/learn?view=${query.view}`}>Clear filters</ButtonLink></div>
        <CatalogFilters activeCount={[query.tag, query.language, query.duration, query.status].filter(Boolean).length}>
          <Field label="Topic"><Select name="tag" defaultValue={query.tag}><option value="">All topics</option>{tags.map(tag => <option key={tag}>{tag}</option>)}</Select></Field>
          <Field label="Language"><Select name="language" defaultValue={query.language}><option value="">All languages</option>{languages.map(lang => <option key={lang} value={lang}>{lang.toUpperCase()}</option>)}</Select></Field>
          <Field label="Duration"><Select name="duration" defaultValue={query.duration}><option value="">Any duration</option><option value="short">Under 20 minutes</option><option value="medium">20–60 minutes</option><option value="long">Over 60 minutes</option></Select></Field>
          <Field label="Enrollment status"><Select name="status" defaultValue={query.status}><option value="">All statuses</option><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option>{query.view === "browse" ? <option value="unenrolled">Not assigned</option> : null}</Select></Field>
          <Field label="Sort by"><Select name="sort" defaultValue={query.sort}><option value="title">Course title</option><option value="duration">Shortest first</option></Select></Field>
        </CatalogFilters>
      </form>
      <h2 className="mb-4 text-lg font-semibold">{result.total} course{result.total === 1 ? "" : "s"}{query.q ? ` matching “${query.q}”` : ""}</h2>
      {result.total ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{result.items.map(course => <CourseCard key={course.id} course={course} progress={progress.get(course.id)} />)}</div> : <EmptyState title="No courses match these filters" body="Clear the filters or try another topic." action={<ButtonLink variant="secondary" href={`/learn?view=${query.view}`}>Clear filters</ButtonLink>} />}
      {result.pages > 1 ? <nav className="mt-6 flex items-center justify-center gap-4" aria-label="Course pages">{result.page > 1 ? <ButtonLink variant="secondary" href={catalogHref(query, { page: result.page - 1 })}>Previous</ButtonLink> : null}<span className="text-sm text-muted">Page {result.page} of {result.pages}</span>{result.page < result.pages ? <ButtonLink variant="secondary" href={catalogHref(query, { page: result.page + 1 })}>Next</ButtonLink> : null}</nav> : null}
    </>}
  </div>;
}
