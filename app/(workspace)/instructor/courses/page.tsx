import { requireRole } from "@/lib/auth/guard";
import { CourseCatalog } from "@/components/course-catalog";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  return (
    <CourseCatalog
      actor={await requireRole("INSTRUCTOR")}
      searchParams={searchParams}
    />
  );
}
