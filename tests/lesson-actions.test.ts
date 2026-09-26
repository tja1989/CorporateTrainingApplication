import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ access: null as unknown, mark: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/db/client", () => ({ t: { lessons: { id: "id" }, modules: { id: "id" } }, db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [(state.access as { lesson: object })?.lesson ?? { courseId: "c" }] }) }) }) } }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/lib/auth/guard", () => ({ requireUser: async () => ({ id: "user" }) }));
vi.mock("@/lib/lms/lesson-access", () => ({ learnerLesson: async () => state.access }));
vi.mock("@/lib/lms/completion", () => ({ markLessonComplete: state.mark }));
import { markCompleteAction, completeLessonAction } from "@/app/(learner)/lesson/actions";
beforeEach(() => { state.mark.mockClear(); state.access = { lesson: { id: "a", type: "TEXT" }, self: { locked: false }, course: { id: "c" } }; });
describe("completion server authority", () => {
  it("returns a confirmed destination for a full navigation after saving", async () => {
    expect(await completeLessonAction("a")).toEqual({ href: "/lesson/a?completed=1" });
    expect(state.mark).toHaveBeenCalledWith("user", "a");
  });
  it("refuses a forged mark-complete on a sequentially locked lesson", async () => {
    state.access = { lesson: { id: "b", type: "TEXT" }, self: { locked: true }, course: { id: "c" } };
    await expect(markCompleteAction("b")).rejects.toThrow("redirect:/lesson/b");
    expect(state.mark).not.toHaveBeenCalled();
  });
  it("returns to the completed lesson so the server can offer its newly eligible next step", async () => {
    await expect(markCompleteAction("a")).rejects.toThrow("redirect:/lesson/a?completed=1");
    expect(state.mark).toHaveBeenCalledWith("user", "a");
  });
  it("refuses a forged manual completion for assessment content", async () => {
    state.access = { lesson: { id: "q", type: "QUIZ" }, self: { locked: false }, course: { id: "c" } };
    await expect(markCompleteAction("q")).rejects.toThrow("redirect:/home");
    expect(state.mark).not.toHaveBeenCalled();
  });
});
