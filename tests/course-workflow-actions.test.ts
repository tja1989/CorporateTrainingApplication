import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  actor: { id: "admin", role: "ADMIN", departmentId: null } as Record<
    string,
    unknown
  >,
  transition: vi.fn(),
  mutate: vi.fn(),
  writes: vi.fn(),
  course: { id: "c", contentRevision: 2 },
  responses: [] as unknown[][],
}));
vi.mock("@/lib/auth/guard", () => ({
  requireRole: async () => state.actor,
  requireUser: async () => state.actor,
  requirePermission: async () => state.actor,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/flash", () => ({ setFlash: vi.fn() }));
vi.mock("@/lib/jobs/queue", () => ({ enqueue: vi.fn(), drain: vi.fn() }));
vi.mock("@/lib/jobs/handlers", () => ({ handlers: {} }));
vi.mock("@/lib/video/ingest", () => ({
  validateYoutubeVideo: async () => ({
    ok: true,
    durationSec: 30,
    title: "QA",
  }),
}));
vi.mock("@/lib/courses/workflow", () => ({
  transitionCourse: state.transition,
  mutateDraftCourse: state.mutate,
}));
vi.mock("@/lib/db/client", async () => ({
  t: await import("../lib/db/schema"),
  db: {
    select: () => {
      const rows = state.responses.shift() ?? [state.course];
      const q: any = {
        from: () => q,
        where: () => q,
        limit: async () => rows,
        then: (resolve: any) => Promise.resolve(rows).then(resolve),
      };
      return q;
    },
    update: () => ({ set: () => ({ where: state.writes }) }),
    insert: () => ({ values: state.writes }),
  },
}));
import {
  setCourseStatusAction,
  updateCourseAction,
  updateInterviewLessonAction,
  addLessonAction,
} from "../app/(workspace)/admin/courses/actions";
beforeEach(() => {
  vi.clearAllMocks();
  state.actor = { id: "admin", role: "ADMIN", departmentId: null };
  state.responses = [];
  state.transition.mockResolvedValue(undefined);
  state.mutate.mockRejectedValue(
    new Error("Withdraw this submitted course before editing."),
  );
});
it("the legacy direct publication action delegates to approval instead of writing status", async () => {
  await setCourseStatusAction("c", "PUBLISHED");
  expect(state.transition).toHaveBeenCalledWith(
    state.actor,
    expect.objectContaining({ courseId: "c", action: "publish", revision: 2 }),
  );
  expect(state.writes).not.toHaveBeenCalled();
});
it("rejects an unknown publication value without revising the course",async()=>{
  expect(await setCourseStatusAction("c","UNRECOGNIZED" as "DRAFT")).toEqual({error:"Choose a valid publication state."});
  expect(state.transition).not.toHaveBeenCalled();expect(state.writes).not.toHaveBeenCalled();
});
it("settings cannot write around the draft mutation gate", async () => {
  const form = new FormData();
  form.set("title", "Changed");
  form.set("estMinutes", "20");
  expect(await updateCourseAction("c", form)).toEqual({
    error: "Withdraw this submitted course before editing.",
  });
  expect(state.writes).not.toHaveBeenCalled();
});
it("an oral-settings edit checks the supplied course membership within the gate", async () => {
  const form = new FormData();
  form.set("title", "Changed");
  await updateInterviewLessonAction("c", "unrelated-lesson", form);
  expect(state.mutate).toHaveBeenCalled();
  expect(state.writes).not.toHaveBeenCalled();
});
it("adding a quiz cannot write around a rejected ownership gate", async () => {
  state.mutate.mockRejectedValueOnce(new Error("You cannot edit this course."));
  const form = new FormData();
  form.set("type", "QUIZ");
  form.set("title", "Forged quiz");
  form.set("bankId", "other-bank");
  form.set("pickN", "2");
  expect(await addLessonAction("c", "other-module", form)).toEqual({
    error: "You cannot edit this course.",
  });
  expect(state.writes).not.toHaveBeenCalled();
});
