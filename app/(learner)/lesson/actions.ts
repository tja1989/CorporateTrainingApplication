"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { markLessonComplete } from "@/lib/lms/completion";

export async function markCompleteAction(lessonId: string): Promise<void> {
  const user = await requireUser();
  const [lesson] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId)).limit(1);
  if (!lesson || (lesson.type !== "TEXT" && lesson.type !== "PDF")) redirect("/home");
  await markLessonComplete(user.id, lessonId);
  const [mod] = await db.select().from(t.modules).where(eq(t.modules.id, lesson.moduleId)).limit(1);
  redirect(mod ? `/course/${mod.courseId}` : "/home");
}
