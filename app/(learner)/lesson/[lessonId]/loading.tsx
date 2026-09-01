import { Skeleton } from "@/components/ui";

/** Skeleton shaped like the lesson page: player column + tutor column. */
export default function LessonLoading() {
  return (
    <div className="min-h-dvh">
      <div className="h-12 border-b border-border" aria-hidden />
      <div className="mx-auto max-w-5xl px-4 pt-6" role="status" aria-label="Loading lesson">
        <Skeleton delayed className="mb-3 h-4 w-1/3" />
        <Skeleton delayed className="mb-4 h-8 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Skeleton delayed className="aspect-video w-full" />
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
