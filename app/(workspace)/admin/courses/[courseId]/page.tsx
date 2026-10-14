import { requireRole } from "@/lib/auth/guard";
import { CourseEditor } from "@/components/course-editor";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const actor = await requireRole("ADMIN");
  return (
    <CourseEditor
      actor={actor}
      courseId={(await params).courseId}
      view={(await searchParams).view}
    />
  );
}
