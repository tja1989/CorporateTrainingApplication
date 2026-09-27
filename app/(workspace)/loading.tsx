import { Skeleton } from "@/components/ui";
export default function WorkspaceLoading() {
  return <div role="status" aria-label="Loading workspace" aria-busy="true">
    <Skeleton className="mb-3 h-8 w-1/2" /><Skeleton className="mb-8 h-4 w-1/3" />
    <Skeleton className="mb-6 h-12" />
    <div className="space-y-3">{[0, 1, 2, 3, 4].map(row => <Skeleton key={row} className="h-16" />)}</div>
    <span className="sr-only">Loading workspace…</span>
  </div>;
}
