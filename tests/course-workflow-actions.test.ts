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
        innerJoin: () => q,
        from: () => q,
        where: () => q,
        limit: async () => rows,
        then: (resolve: any) => Promise.resolve(rows).then(resolve),
      };
      return q;
    },
    update: () => ({ set: (values: unknown) => ({ where: async () => state.writes(values) }) }),
    insert: () => ({ values: state.writes }),
  },
}));
import {
  setCourseStatusAction,
  updateCourseAction,
  updateInterviewLessonAction,
  addLessonAction,
  updateContentLessonAction,
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
  form.set("drawBank", "other-bank");
  form.set("drawCount", "2");
  expect(await addLessonAction("c", "other-module", form)).toEqual({
    error: "You cannot edit this course.",
  });
  expect(state.writes).not.toHaveBeenCalled();
});
it("an instructor's quiz can draw from a bank that names another course", async () => {
  const { db } = await import("../lib/db/client");
  state.actor = { id: "ana", role: "INSTRUCTOR", departmentId: null };
  state.mutate.mockImplementation(async (_actor, _course, run) => run(db));
  // module, its lessons, then the drawn bank
  state.responses = [
    [{ id: "m", courseId: "c" }],
    [],
    [{ id: "other-bank", courseId: "another-course" }],
  ];
  const form = new FormData();
  form.set("type", "QUIZ");
  form.set("title", "Shared bank quiz");
  form.append("drawBank", "other-bank");
  form.append("drawCount", "2");
  expect(await addLessonAction("c", "m", form)).toEqual({ success: "Lesson added." });
  expect(state.writes).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Shared bank quiz",
      sections: [{ bankId: "other-bank", pickN: 2 }],
      settings: expect.objectContaining({ passPct: 70, feedbackMode: "PRACTICE", integrityMode: false }),
    }),
  );
  expect(state.writes).toHaveBeenCalledWith(
    expect.objectContaining({ type: "QUIZ", payload: { quizId: expect.any(String) } }),
  );
});
it("a new quiz is validated like a saved one and writes nothing when empty", async () => {
  const { db } = await import("../lib/db/client");
  state.mutate.mockImplementation(async (_actor, _course, run) => run(db));
  state.responses = [[{ id: "m", courseId: "c" }], []];
  const form = new FormData();
  form.set("type", "QUIZ");
  form.set("title", "Empty quiz");
  expect(await addLessonAction("c", "m", form)).toEqual({ error: "Add at least one question." });
  expect(state.writes).not.toHaveBeenCalled();
});
it("a new practice quiz with a live-exam question needs confirmation", async () => {
  const { db } = await import("../lib/db/client");
  state.mutate.mockImplementation(async (_actor, _course, run) => run(db));
  const liveExam = {
    courseId: "live", courseTitle: "Live", status: "PUBLISHED", approvalState: "APPROVED",
    lessonId: "exam", quizTitle: "Exam", sections: [{ fixed: ["q1"] }], settings: { feedbackMode: "EXAM" },
  };
  // module, its lessons, approved picks, then usage: the question and the quizzes using it
  state.responses = [[{ id: "m", courseId: "c" }], [], [{ id: "q1" }], [{ id: "q1", bankId: "b" }], [liveExam]];
  const form = new FormData();
  form.set("type", "QUIZ");
  form.set("title", "Practice");
  form.append("picked", "q1");
  expect(await addLessonAction("c", "m", form)).toEqual({
    error: "Confirm that learners will see answers to questions used in a live exam.",
  });
  expect(state.writes).not.toHaveBeenCalled();
  state.responses = [[{ id: "m", courseId: "c" }], [], [{ id: "q1" }]];
  form.set("confirmLiveExam", "on");
  expect(await addLessonAction("c", "m", form)).toEqual({ success: "Lesson added." });
  expect(state.writes).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Practice", sections: [{ fixed: ["q1"] }] }),
  );
});

it("correcting a rejected text lesson cannot bypass the draft revision guard",async()=>{
 const form=new FormData();form.set("title","Corrected lesson");form.set("body","Correct procedure");form.set("revision","2");
 expect(await updateContentLessonAction("c","lesson",form)).toEqual({error:"Withdraw this submitted course before editing."});
 expect(state.mutate).toHaveBeenCalledWith(state.actor,"c",expect.any(Function),2);
 expect(state.writes).not.toHaveBeenCalled();
});

it("text correction preserves lesson payload metadata and its identity",async()=>{
 const {db}=await import("../lib/db/client");
 state.mutate.mockImplementation(async (_actor,_course,run)=>run(db));
 state.responses=[[{lesson:{id:"lesson",type:"TEXT",title:"Wrong",payload:{body:"Wrong content",language:"en"}}}]];
 const form=new FormData();form.set("title","Corrected");form.set("body","Correct procedure");form.set("revision","2");
 expect(await updateContentLessonAction("c","lesson",form)).toMatchObject({success:expect.any(String)});
 expect(state.writes).toHaveBeenCalledWith({title:"Corrected",payload:{body:"Correct procedure",language:"en"},searchText:"Correct procedure"});
});
it("PDF correction validates its URL and checks course membership before writing",async()=>{
 const {db}=await import("../lib/db/client");state.mutate.mockImplementation(async (_actor,_course,run)=>run(db));
 const form=new FormData();form.set("title","Correct PDF");form.set("fileUrl","javascript:alert(1)");
 state.responses=[[{lesson:{type:"PDF",payload:{fileUrl:"/old.pdf"}}}]];
 expect(await updateContentLessonAction("c","lesson",form)).toMatchObject({error:expect.stringContaining("HTTPS")});expect(state.writes).not.toHaveBeenCalled();
 state.responses=[[]];form.set("fileUrl","/correct.pdf");
 expect(await updateContentLessonAction("c","foreign",form)).toMatchObject({error:expect.stringContaining("does not belong")});expect(state.writes).not.toHaveBeenCalled();
 state.responses=[[{lesson:{type:"PDF",payload:{fileUrl:"/old.pdf"}}}]];
 expect(await updateContentLessonAction("c","lesson",form)).toMatchObject({success:expect.any(String)});
 expect(state.writes).toHaveBeenCalledWith({title:"Correct PDF",payload:{fileUrl:"/correct.pdf"},searchText:null});
});
