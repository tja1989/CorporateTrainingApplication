import type { QuestionBody, QuizSettings, Rubric } from "../lib/db/schema";

/** Assessment seed (M3): banks, APPROVED questions, quizzes as QUIZ lessons, a staged pending review. */
export async function seedAssessments(opts: {
  courseIds: { customerService: string; foodSafety: string; fire: string; pos: string };
  learnerIds: { farhan: string; meera: string };
}): Promise<void> {
  const { db, t } = await import("../lib/db/client");
  const { id } = await import("../lib/ids");
  const { eq } = await import("drizzle-orm");
  const { DEFAULT_SETTINGS, startAttempt, submitAttempt } = await import("../lib/quiz/engine");

  type QSeed = {
    type: "mcq_single" | "mcq_multi" | "truefalse" | "fill_blank" | "matching" | "ordering" | "free_text";
    body: QuestionBody;
    rubric?: Rubric;
    points?: number;
  };

  async function makeBank(name: string, courseId: string, questions: QSeed[]): Promise<{ bankId: string; questionIds: string[] }> {
    const bankId = id();
    await db.insert(t.questionBanks).values({ id: bankId, name, courseId, tags: [] });
    const questionIds: string[] = [];
    for (const q of questions) {
      const qid = id();
      questionIds.push(qid);
      await db.insert(t.questions).values({
        id: qid,
        bankId,
        type: q.type,
        status: "APPROVED",
        points: q.points ?? 1,
        body: q.body,
        rubric: q.rubric ?? null,
        createdBy: "human",
      });
    }
    return { bankId, questionIds };
  }

  async function makeQuizLesson(courseId: string, quizTitle: string, settings: QuizSettings, fixed: string[]): Promise<string> {
    const quizId = id();
    await db.insert(t.quizzes).values({ id: quizId, lessonId: null, title: quizTitle, settings, sections: [{ fixed }] });
    const mods = await db.select().from(t.modules).where(eq(t.modules.courseId, courseId));
    const moduleId = id();
    await db.insert(t.modules).values({ id: moduleId, courseId, title: "Check your knowledge", sort: mods.length });
    const lessonId = id();
    await db.insert(t.lessons).values({ id: lessonId, moduleId, type: "QUIZ", title: quizTitle, sort: 0, payload: { quizId } });
    await db.update(t.quizzes).set({ lessonId }).where(eq(t.quizzes.id, quizId));
    return quizId;
  }

  // ---- Customer Service: practice quiz incl. AI-graded scenario
  const cs = await makeBank("Customer Service Basics", opts.courseIds.customerService, [
    {
      type: "mcq_single",
      body: {
        prompt: "A customer enters your section while you are restocking. Within how many seconds should you acknowledge them?",
        options: ["30 seconds", "10 seconds", "Only when they speak to you", "60 seconds"],
        correct: [1],
        lockedOptionIndices: [],
        explanation: "The 10-second rule: acknowledge every customer within 10 seconds — a smile or nod counts.",
      },
    },
    {
      type: "matching",
      body: {
        prompt: "Match each letter of the LAST method to its meaning.",
        pairs: [
          { left: "L", right: "Listen without interrupting" },
          { left: "A", right: "Apologize sincerely" },
          { left: "S", right: "Solve what you can on the spot" },
          { left: "T", right: "Thank them for telling us" },
        ],
        explanation: "LAST: Listen, Apologize, Solve, Thank.",
      },
    },
    {
      type: "truefalse",
      body: {
        prompt: "If you cannot help a customer, pointing them toward the right aisle is enough.",
        correct: [1],
        explanation: "Walk, don't point — walking the customer over is the behaviour customers remember most.",
      },
    },
    {
      type: "ordering",
      body: {
        prompt: "Put the greeting steps in the right order.",
        orderItems: ["Smile and make eye contact", "Greet: “Welcome! How can I help?”", "Listen fully before answering"],
        explanation: "Smile → greet → listen.",
      },
    },
    {
      type: "free_text",
      points: 4,
      body: {
        prompt:
          "Scenario: a customer is angry because an advertised discount didn't apply at the till. Describe, step by step, how you would handle it.",
      },
      rubric: {
        criteria: [
          { name: "Listens fully and stays calm", points: 1 },
          { name: "Apologizes sincerely", points: 1 },
          { name: "Offers a concrete solution or escalates to team leader", points: 1 },
          { name: "Thanks the customer / closes respectfully", points: 1 },
        ],
        modelAnswer:
          "Listen to the customer completely without interrupting and stay calm. Apologize sincerely for the confusion. Check the advertised price; if I can fix it at the till within policy I do it immediately, otherwise I call my team leader right away rather than arguing. Thank the customer for their patience and for telling us so we can fix the signage.",
      },
    },
  ]);
  await makeQuizLesson(opts.courseIds.customerService, "Service standard check", {
    ...DEFAULT_SETTINGS,
    feedbackMode: "PRACTICE",
    passPct: 70,
    shuffleQuestions: false,
  }, cs.questionIds);

  // ---- Food Safety: EXAM with integrity monitoring + time limit
  const fs = await makeBank("Food Safety Essentials", opts.courseIds.foodSafety, [
    {
      type: "fill_blank",
      body: {
        prompt: "Scrubbing your hands with soap should take at least _____ seconds.",
        acceptedAnswers: ["20", "twenty", "20 seconds"],
        explanation: "At least 20 seconds covering palms, backs, fingers, thumbs and nails.",
      },
    },
    {
      type: "mcq_single",
      body: {
        prompt: "Chilled food must be kept below which temperature?",
        options: ["10°C", "5°C", "0°C", "8°C"],
        correct: [1],
        explanation: "Chilled food lives below 5°C; the danger zone starts at 5°C.",
      },
    },
    {
      type: "mcq_multi",
      body: {
        prompt: "When must you wash your hands? Select all that apply.",
        options: ["Before handling food", "After touching your phone", "After handling raw meat", "Only at the start of your shift"],
        correct: [0, 1, 2],
        explanation: "Wash before food handling and after any contamination risk — phones included.",
      },
    },
    {
      type: "truefalse",
      body: {
        prompt: "Gloves make handwashing unnecessary.",
        correct: [1],
        explanation: "Gloves protect food only if changed as often as you would wash your hands.",
      },
    },
    {
      type: "mcq_single",
      body: {
        prompt: "Why are wound plasters in food areas blue?",
        options: [
          "Blue is the company colour",
          "No natural food is blue, so a lost plaster is easy to spot",
          "Blue plasters are more sterile",
          "It is a legal requirement in every country",
        ],
        correct: [1],
        explanation: "Blue stands out because no natural food is blue.",
      },
    },
  ]);
  await makeQuizLesson(opts.courseIds.foodSafety, "Food safety certification exam", {
    ...DEFAULT_SETTINGS,
    feedbackMode: "EXAM",
    passPct: 70,
    attemptsLimit: 3,
    cooldownMinutes: 30,
    timeLimitSec: 300,
    integrityMode: true,
    oneAtATime: true,
  }, fs.questionIds);

  // ---- Fire & POS: short practice quizzes
  const fire = await makeBank("Fire & Emergency", opts.courseIds.fire, [
    {
      type: "mcq_single",
      body: {
        prompt: "The alarm sounds while you are serving a customer. What do you do first?",
        options: ["Finish the sale quickly", "Stop serving and guide the customer to the nearest exit", "Call your manager", "Collect your belongings"],
        correct: [1],
        explanation: "Safety beats sales — stop and guide customers to the nearest green-signed exit.",
      },
    },
    {
      type: "truefalse",
      body: { prompt: "Lifts may be used during an evacuation if the queue at the stairs is long.", correct: [1], explanation: "Never use lifts during an evacuation." },
    },
    {
      type: "fill_blank",
      body: { prompt: "After evacuating, report to your assembly point _____ for the head count.", acceptedAnswers: ["marshal", "the marshal"], explanation: "The marshal runs the head count." },
    },
  ]);
  await makeQuizLesson(opts.courseIds.fire, "Emergency basics check", { ...DEFAULT_SETTINGS, passPct: 70 }, fire.questionIds);

  const pos = await makeBank("POS & Cash Handling", opts.courseIds.pos, [
    {
      type: "mcq_single",
      body: {
        prompt: "Refunds above which amount need team-leader approval?",
        options: ["AED 100", "AED 200", "AED 500", "All refunds"],
        correct: [1],
        explanation: "Team-leader approval is required above AED 200.",
      },
    },
    {
      type: "truefalse",
      body: { prompt: "A card refund may be paid in cash if the customer prefers.", correct: [1], explanation: "Refund to the original payment method only." },
    },
    {
      type: "mcq_single",
      body: {
        prompt: "You find an AED 5 variance at till close. What is the right action?",
        options: ["Add AED 5 from your pocket", "Record it honestly on the variance sheet", "Ignore it — it's small", "Round the next sale up"],
        correct: [1],
        explanation: "An honest variance is a note; a hidden one is a disciplinary issue.",
      },
    },
    {
      type: "ordering",
      body: {
        prompt: "Order the till-opening steps.",
        orderItems: ["Count the float with a witness", "Sign the float sheet", "Check the receipt roll"],
        explanation: "Count → sign → check.",
      },
    },
  ]);
  await makeQuizLesson(opts.courseIds.pos, "Till discipline check", { ...DEFAULT_SETTINGS, passPct: 75 }, pos.questionIds);

  // ---- Staged attempt: Meera submits the CS scenario → lands in the human review queue
  const [csQuiz] = await db.select().from(t.quizzes).where(eq(t.quizzes.title, "Service standard check")).limit(1);
  if (csQuiz) {
    const attempt = await startAttempt(csQuiz, { id: opts.learnerIds.meera, timeMultiplier: 1 });
    const answers: Record<string, unknown> = {};
    for (const served of attempt.servedItems) {
      const [q] = await db.select().from(t.questions).where(eq(t.questions.id, served.questionId)).limit(1);
      if (!q) continue;
      if (q.type === "free_text") {
        answers[q.id] = {
          kind: "text",
          text: "I listen to the customer first and say sorry for the trouble. Then I check the price. If it is our mistake I call my team leader to fix the bill. I thank the customer at the end.",
        };
      } else if (q.type === "mcq_single" || q.type === "truefalse") {
        answers[q.id] = { kind: "choice", selected: q.body.correct ?? [0] };
      } else if (q.type === "matching") {
        const pairs: Record<number, number> = {};
        const co = served.choiceOrder;
        (q.body.pairs ?? []).forEach((_, li) => {
          const display = co ? co.indexOf(li) : li;
          pairs[li] = display;
        });
        answers[q.id] = { kind: "matching", pairs };
      } else if (q.type === "ordering") {
        const co = served.choiceOrder;
        const order = (q.body.orderItems ?? []).map((_, actual) => (co ? co.indexOf(actual) : actual));
        answers[q.id] = { kind: "ordering", order };
      }
    }
    await db.update(t.attempts).set({ answers: answers as Record<string, never> }).where(eq(t.attempts.id, attempt.id));
    await submitAttempt(attempt.id);
  }

  console.log("Assessments seeded: 4 banks, 4 quizzes, staged AI-graded attempt in review queue.");
}
