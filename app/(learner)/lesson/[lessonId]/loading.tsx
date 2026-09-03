import { Skeleton } from "@/components/ui";

/**
 * Skeleton shaped like the lesson page: the course-contents rail from xl,
 * then breadcrumb, title, and the player column beside the tutor column. It
 * renders inside the shell's wide lesson measure, so no chrome is drawn here.
 */
export default function LessonLoading() {
  return (
    <div className="flex gap-6" role="status" aria-label="Loading lesson">
      <div className="hidden w-rail shrink-0 xl:block" aria-hidden>
        <Skeleton delayed className="mb-3 h-4 w-2/3" />
        <Skeleton delayed className="mb-2 h-8" />
        <Skeleton delayed className="mb-2 h-8" />
        <Skeleton delayed className="mb-2 h-8" />
        <Skeleton delayed className="h-8" />
      </div>
      <div className="min-w-0 flex-1">
        <Skeleton delayed className="mb-3 h-4 w-1/3" />
        <Skeleton delayed className="mb-4 h-12 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Skeleton delayed className="aspect-video w-full rounded-card" />
          <div className="flex flex-col gap-2">
            <Skeleton delayed className="h-12" />
            <Skeleton delayed className="h-[64px]" />
            <Skeleton delayed className="h-[64px]" />
            <Skeleton delayed className="h-[64px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
