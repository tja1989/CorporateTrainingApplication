import { Skeleton } from "@/components/ui";

/**
 * Layout-matching skeleton for learner routes (spec §10.6: nothing before
 * 300ms, then the real shape). It renders inside the shell — header, rail and
 * content measure are already on screen — so it draws only the page's shapes:
 * title, the at-a-glance band, then list rows.
 */
export default function LearnerLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton delayed className="mb-6 h-12 w-1/2" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Skeleton delayed className="col-span-2 h-[108px] rounded-card sm:col-span-1" />
        <Skeleton delayed className="h-[108px] rounded-card" />
        <Skeleton delayed className="h-[108px] rounded-card" />
      </div>
      <Skeleton delayed className="mb-2 h-4 w-24" />
      <Skeleton delayed className="mb-2 h-[58px] rounded-card" />
      <Skeleton delayed className="mb-2 h-[58px] rounded-card" />
      <Skeleton delayed className="h-[58px] rounded-card" />
    </div>
  );
}
