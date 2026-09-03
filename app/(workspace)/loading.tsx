import { Skeleton } from "@/components/ui";

/**
 * Layout-matching skeleton for admin/manager routes: title, tile row, table
 * rows. It renders inside the workspace shell, beside the real rail and under
 * the real header, so it draws only the page's shapes.
 */
export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton delayed className="mb-6 h-12 w-1/3" />
      <div className="mb-6 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
        <Skeleton delayed className="h-[108px] rounded-card" />
        <Skeleton delayed className="h-[108px] rounded-card" />
        <Skeleton delayed className="h-[108px] rounded-card" />
        <Skeleton delayed className="h-[108px] rounded-card" />
      </div>
      <div className="flex max-w-3xl flex-col gap-2">
        <Skeleton delayed className="h-12" />
        <Skeleton delayed className="h-12" />
        <Skeleton delayed className="h-12" />
        <Skeleton delayed className="h-12" />
        <Skeleton delayed className="h-12" />
        <Skeleton delayed className="h-12" />
      </div>
    </div>
  );
}
