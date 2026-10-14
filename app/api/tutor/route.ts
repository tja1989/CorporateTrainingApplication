import { and, asc, eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { id } from "@/lib/ids";
import { tutorAnswer } from "@/lib/ai/tutor";
import { recordActivityDay } from "@/lib/lms/completion";
import { allowedTutorSources, resolveTutorCitations } from "@/lib/ai/tutor-sources";

export const maxDuration = 60;

/**
 * Tutor chat (spec FR-5.9..5.12): SSE stream of {delta} events, then {final}
 * with validated citations. Persists threads per user+course.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if ((user.role === "ADMIN" && !user.session.mfa) || user.privacyNoticeVersion < 1) return new Response("Complete sign-in first", { status: 403 });
  const body = (await req.json()) as { lessonId: string; message: string; scope?: "lesson" | "course"; threadId?: string };
  if (!body.lessonId || !body.message?.trim() || body.message.length > 2000) {
    return new Response("Bad request", { status: 400 });
  }

  // resolve lesson → video + course
  const allowed = await allowedTutorSources(user.id, body.lessonId);
  if (!allowed) return new Response("Lesson unavailable", { status: 403 });
  const { lesson, mod } = allowed.access;

  // scope: this lesson's video, or all videos in the course (spec FR-5.10)
  let scope: { videoId?: string; videoIds?: string[] } = { videoId: lesson.payload.videoId };
  if (body.scope === "course") {
    scope = { videoIds: allowed.sources.map(s => s.videoId) };
  }

  // thread
  let threadId = body.threadId ?? null;
  if (threadId) {
    const [thread] = await db.select().from(t.tutorThreads).where(eq(t.tutorThreads.id, threadId)).limit(1);
    if (!thread || thread.userId !== user.id || thread.courseId !== mod.courseId) threadId = null;
  }
  if (!threadId) {
    const [existing] = await db
      .select()
      .from(t.tutorThreads)
      .where(and(eq(t.tutorThreads.userId, user.id), eq(t.tutorThreads.courseId, mod.courseId)))
      .limit(1);
    threadId = existing?.id ?? null;
  }
  if (!threadId) {
    threadId = id();
    await db.insert(t.tutorThreads).values({ id: threadId, userId: user.id, courseId: mod.courseId, lessonId: lesson.id });
  }

  const history = (
    await db.select().from(t.tutorMessages).where(eq(t.tutorMessages.threadId, threadId)).orderBy(asc(t.tutorMessages.createdAt))
  ).map((m) => ({ role: m.role, content: m.content }));

  await db.insert(t.tutorMessages).values({ id: id(), threadId, role: "user", content: body.message.trim() });
  await db.insert(t.uiEvents).values({ id: id(), userId: user.id, kind: "tutor_ask", payload: { lessonId: lesson.id } });
  await recordActivityDay(user.id);

  const encoder = new TextEncoder();
  const tid = threadId;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send({ type: "thread", threadId: tid });
      try {
        for await (const event of tutorAnswer({ question: body.message.trim(), scope, history })) {
          const delivered = event.type === "final" ? { ...event, citations: resolveTutorCitations(event.citations, allowed.sources) } : event;
          send(delivered);
          if (event.type === "final") {
            await db.insert(t.tutorMessages).values({
              id: id(),
              threadId: tid,
              role: "assistant",
              content: event.answer,
              citations: delivered.type === "final" ? delivered.citations : [],
            });
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Tutor failed" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
