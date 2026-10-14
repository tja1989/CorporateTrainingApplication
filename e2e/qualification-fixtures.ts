import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS } from "../lib/quiz/engine";
import type { QuizSettings } from "../lib/db/schema";
import { withDb } from "./support";

export async function textCourse(userId: string, options: { title?: string; certificate?: boolean; dueAt?: Date } = {}) {
  const course = randomUUID(), module = randomUUID(), lesson = randomUUID();
  const title = options.title ?? `QA qualification ${course.slice(0, 8)}`;
  await withDb(async db => {
    await db.query("INSERT INTO courses(id,title,status,certificate_enabled,certificate_validity_days) VALUES($1,$2,'PUBLISHED',$3,30)", [course, title, options.certificate ?? false]);
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,'Qualification module')", [module, course]);
    await db.query("INSERT INTO lessons(id,module_id,type,title,payload) VALUES($1,$2,'TEXT','Read the safety checklist',$3)", [lesson, module, JSON.stringify({ body: "# Safety checklist\n\nRead the procedure carefully and ask your supervisor for help. مرحباً بكم। सुरक्षित रहें। സുരക്ഷിതരായിരിക്കുക." })]);
    await db.query("INSERT INTO enrollments(id,user_id,course_id,source,due_at) VALUES($1,$2,$3,'manual',$4)", [randomUUID(), userId, course, options.dueAt ?? null]);
  });
  return { course, module, lesson, title };
}

export async function smallQuiz(settings: Partial<QuizSettings> = {}) {
  const quiz = randomUUID(), bank = randomUUID(), questions = [randomUUID(), randomUUID()];
  await withDb(async db => {
    await db.query("INSERT INTO question_banks(id,name) VALUES($1,'QA rule bank')", [bank]);
    await db.query("INSERT INTO questions(id,bank_id,type,status,body) VALUES($1,$3,'mcq_single','APPROVED',$4),($2,$3,'fill_blank','APPROVED',$5)", [questions[0], questions[1], bank, JSON.stringify({ prompt: "Choose the safe action", options: ["Wash hands", "Skip washing"], correct: [0], explanation: "Clean hands protect customers." }), JSON.stringify({ prompt: "Type the safety word", acceptedAnswers: ["safe"], explanation: "Safety comes first." })]);
    await db.query("INSERT INTO quizzes(id,title,settings,sections) VALUES($1,'QA assessment rules',$2,$3)", [quiz, JSON.stringify({ ...DEFAULT_SETTINGS, shuffleChoices: false, shuffleQuestions: false, ...settings }), JSON.stringify([{ fixed: questions }])]);
  });
  return { quiz, questions };
}

export async function assessmentFixture() {
  const quiz = randomUUID(), bank = randomUUID();
  const questions = [
    { type: "mcq_single", body: { prompt: "Choose the safe greeting", options: ["Hello", "Ignore"], correct: [0] } },
    { type: "mcq_multi", body: { prompt: "Choose the safety checks", options: ["Wash", "Clean", "Skip"], correct: [0, 1] } },
    { type: "truefalse", body: { prompt: "Clean hands protect customers", correct: [0] } },
    { type: "fill_blank", body: { prompt: "Name the greeting", acceptedAnswers: ["Hello"] } },
    { type: "matching", body: { prompt: "Match the task", pairs: [{ left: "Hands", right: "Wash" }, { left: "Counter", right: "Clean" }] } },
    { type: "ordering", body: { prompt: "Order the steps", orderItems: ["Wet", "Wash", "Dry"] } },
    { type: "free_text", body: { prompt: "Explain safe service" } },
  ];
  const ids = questions.map(() => randomUUID());
  await withDb(async db => {
    await db.query("INSERT INTO question_banks (id,name) VALUES ($1,'QA assessment bank')", [bank]);
    for (let i = 0; i < questions.length; i++) await db.query("INSERT INTO questions (id,bank_id,type,status,body) VALUES ($1,$2,$3,'APPROVED',$4)", [ids[i], bank, questions[i].type, JSON.stringify(questions[i].body)]);
    await db.query("INSERT INTO quizzes (id,title,settings,sections) VALUES ($1,'QA seven question assessment',$2,$3)", [quiz, JSON.stringify({ ...DEFAULT_SETTINGS, shuffleQuestions: false, shuffleChoices: false }), JSON.stringify([{ fixed: ids }])]);
  });
  return quiz;
}


export async function tutorFixture() {
  const course = randomUUID(), module = randomUUID(), lessons = [randomUUID(), randomUUID()], videos = [randomUUID(), randomUUID()];
  await withDb(async db => {
    await db.query("INSERT INTO courses(id,title,status) VALUES($1,'QA tutor scoped course','PUBLISHED')", [course]);
    await db.query("INSERT INTO modules(id,course_id,title) VALUES($1,$2,'Video sources')", [module, course]);
    for (let i=0; i<2; i++) {
      await db.query("INSERT INTO videos(id,youtube_id,title,duration_sec,ingestion_status) VALUES($1,$2,$3,100,'READY')", [videos[i], `QA${videos[i].slice(0,9)}`, `QA source ${i+1}`]);
      await db.query("INSERT INTO lessons(id,module_id,type,title,sort,payload) VALUES($1,$2,'VIDEO',$3,$4,$5)", [lessons[i], module, `QA video ${i+1}`, i, JSON.stringify({videoId:videos[i]})]);
      await db.query("INSERT INTO video_chunks(id,video_id,start_sec,end_sec,text) VALUES($1,$2,10,20,$3)", [randomUUID(), videos[i], i===0 ? "Wash hands before serving food." : "Inspect extinguishers before an emergency."]);
    }
  });
  return { course, module, lessons, videos };
}
