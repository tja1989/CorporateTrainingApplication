import { Skeleton } from "@/components/ui";
export default function LessonLoading() {
  return <div role="status" aria-label="Loading lesson" aria-busy="true" className="lesson-workspace">
    <div><Skeleton className="mb-4 h-8 w-2/3" /><Skeleton className="aspect-video w-full rounded-card" /><Skeleton className="mt-6 h-12 w-1/2" /><Skeleton className="mt-4 h-16" /></div>
    <div className="lesson-contents-panel space-y-3"><Skeleton className="h-8" />{[0, 1, 2, 3].map(row => <Skeleton key={row} className="h-16" />)}</div>
    <span className="sr-only">Loading lesson and course contents…</span>
  </div>;
}
