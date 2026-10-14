"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { markLessonComplete } from "@/lib/lms/completion";
import { learnerLesson } from "@/lib/lms/lesson-access";

export async function completeLessonAction(lessonId: string): Promise<{ href: string }> {
  const user = await requireUser();
  const access = await learnerLesson(user.id, lessonId);
  if (!access || !["TEXT", "PDF"].includes(access.lesson.type)) redirect("/home");
  if (access.self.locked) redirect(`/lesson/${lessonId}`);
  await markLessonComplete(user.id, lessonId);
  revalidatePath(`/lesson/${lessonId}`);
  revalidatePath(`/course/${access.course.id}`);
  revalidatePath("/home");
  return { href: `/lesson/${lessonId}?completed=1` };
}

/** Preserve the existing server-action contract for older forms. */
export async function markCompleteAction(lessonId: string): Promise<void> {
  const result = await completeLessonAction(lessonId);
  redirect(result.href);
}
