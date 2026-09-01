import { Skeleton } from "@/components/ui";

/** Layout-matching skeleton for admin/manager routes: title, tile row, table rows. */
export default function WorkspaceLoading() {
  return (
    <div className="min-h-dvh">
      <div className="h-12 border-b border-border" aria-hidden />
      <div className="flex">
        <div className="hidden w-rail shrink-0 border-e border-border p-4 md:block" aria-hidden />
        <div className="min-w-0 flex-1 px-6 py-6" role="status" aria-label="Loading">
          <Skeleton delayed className="mb-6 h-8 w-1/3" />
          <div className="mb-6 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton delayed className="h-[88px]" />
            <Skeleton delayed className="h-[88px]" />
            <Skeleton delayed className="h-[88px]" />
            <Skeleton delayed className="h-[88px]" />
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
      </div>
    </div>
  );
}
