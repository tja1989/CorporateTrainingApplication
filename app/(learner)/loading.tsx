import { Skeleton } from "@/components/ui";

/** Layout-matching skeleton for learner routes (spec §10.6: nothing before 300ms, then the real shape). */
export default function LearnerLoading() {
  return (
    <div className="min-h-dvh">
      <div className="h-12 border-b border-border" aria-hidden />
      <div className="flex">
        <div className="hidden w-rail-sm shrink-0 md:block" aria-hidden />
        <div className="mx-auto w-full max-w-5xl px-4 pt-6" role="status" aria-label="Loading">
        <Skeleton delayed className="mb-6 h-8 w-1/2" />
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton delayed className="col-span-2 h-[88px] sm:col-span-1" />
          <Skeleton delayed className="h-[88px]" />
          <Skeleton delayed className="h-[88px]" />
        </div>
        <Skeleton delayed className="mb-2 h-[64px]" />
        <Skeleton delayed className="mb-2 h-[64px]" />
        <Skeleton delayed className="mb-2 h-[64px]" />
        <Skeleton delayed className="h-[64px]" />
        </div>
      </div>
    </div>
  );
}
