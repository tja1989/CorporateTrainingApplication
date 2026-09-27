import { Skeleton } from "@/components/ui";
export default function LearnerLoading() {
  return <div role="status" aria-label="Loading learning content" aria-busy="true">
    <Skeleton className="mb-3 h-8 w-2/3" /><Skeleton className="mb-8 h-4 w-1/3" />
    <div className="mb-8 flex flex-col gap-4 md:flex-row"><Skeleton className="aspect-video w-full md:w-1/3" /><div className="flex-1 space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-12 w-1/3" /></div></div>
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(item => <Skeleton key={item} className="aspect-video rounded-card" />)}</div>
    <span className="sr-only">Loading your courses…</span>
  </div>;
}
