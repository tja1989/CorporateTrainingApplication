import { loadEnv } from "../lib/env";
loadEnv();

import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import bcrypt from "bcryptjs";
import { ensureDemoContentLessons } from "./seed-content";
import { ensureDemoInterviewLessons } from "./seed-interviews";

async function main() {
  const { db, t, pool } = await import("../lib/db/client");
  const { id, activationCode } = await import("../lib/ids");
  const { makePdf } = await import("../lib/pdf");
  const { reevaluateAllUsers } = await import("../lib/lms/rules");
  const { runDailySweep } = await import("../lib/lms/sweep");
  const { seedAssessments } = await import("./seed-assessments");
  const { seedHrCorpus } = await import("./seed-hr");
  const { seedVideos } = await import("./seed-videos");

  console.log("Seeding demo data (DEMO_MODE)…");

  // ---- wipe (demo reseed is destructive by design)
  const tables = [
    "ui_events", "ai_call_log", "notifications", "badges", "points_ledger", "streak_state", "drill_state",
    "integrity_events", "grading_reviews", "attempts", "quizzes", "questions", "question_banks",
    "hr_ticket_messages", "hr_tickets", "hr_audit_log", "hr_messages", "hr_conversations",
    "policy_chunks", "policy_docs", "tutor_messages", "tutor_threads", "live_interviews", "video_chunks", "videos",
    "certificates", "completion_records", "lesson_progress", "enrollments", "enrollment_rules",
    "path_courses", "paths", "lessons", "modules", "courses", "jobs", "report_views",
    "consents", "login_attempts", "users", "groups", "org_units",
  ];
  for (const table of tables) await pool.query(`DELETE FROM ${table}`);

  // ---- org: UAE → 2 regions → 4 stores
  const uae = { id: id(), type: "country" as const, parentId: null, name: "United Arab Emirates", timezone: "Asia/Dubai" };
  const regions = [
    { id: id(), type: "region" as const, parentId: uae.id, name: "Abu Dhabi", timezone: "Asia/Dubai" },
    { id: id(), type: "region" as const, parentId: uae.id, name: "Dubai & Northern Emirates", timezone: "Asia/Dubai" },
  ];
  const stores = [
    { id: id(), type: "store" as const, parentId: regions[0].id, name: "Khalidiyah Hypermarket", timezone: "Asia/Dubai" },
    { id: id(), type: "store" as const, parentId: regions[0].id, name: "Mushrif Mall Store", timezone: "Asia/Dubai" },
    { id: id(), type: "store" as const, parentId: regions[1].id, name: "Barsha Hypermarket", timezone: "Asia/Dubai" },
    { id: id(), type: "store" as const, parentId: regions[1].id, name: "Silicon Central Store", timezone: "Asia/Dubai" },
  ];
  await db.insert(t.orgUnits).values([uae, ...regions, ...stores]);

  const groupRows = ["Cashier", "Fresh Food", "Pharmacy", "Team Leader"].map((name) => ({ id: id(), name }));
  await db.insert(t.groups).values(groupRows);
  const groupId = (name: string) => groupRows.find((g) => g.name === name)!.id;

  // ---- users
  const pw = await bcrypt.hash("demo1234", 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000);

  const amina = {
    id: id(), employeeId: "AE90001", name: "Amina Al Mansouri", role: "ADMIN" as const,
    storeId: stores[0].id, managerId: null, groupIds: [], jobTitle: "HR Administrator",
    hireDate: daysAgo(1500), preferredLanguage: "en", email: "amina@demo.example",
    passwordHash: pw, passwordState: "ACTIVE" as const, privacyNoticeVersion: 0,
  };
  const joseph = {
    id: id(), employeeId: "AE20001", name: "Joseph Mathew", role: "MANAGER" as const,
    storeId: stores[0].id, managerId: null, groupIds: [groupId("Team Leader")], jobTitle: "Department Manager",
    hireDate: daysAgo(1200), preferredLanguage: "en", email: "joseph@demo.example",
    passwordHash: pw, passwordState: "ACTIVE" as const, privacyNoticeVersion: 0,
  };
  const fatima = {
    id: id(), employeeId: "AE20002", name: "Fatima Rahman", role: "MANAGER" as const,
    storeId: stores[2].id, managerId: null, groupIds: [groupId("Team Leader")], jobTitle: "Store Manager",
    hireDate: daysAgo(900), preferredLanguage: "en", email: "fatima@demo.example",
    passwordHash: pw, passwordState: "ACTIVE" as const, privacyNoticeVersion: 0,
  };
  const farhan = {
    id: id(), employeeId: "AE10023", name: "Farhan Sheikh", role: "LEARNER" as const,
    storeId: stores[0].id, managerId: joseph.id, groupIds: [groupId("Cashier")], jobTitle: "Cashier",
    hireDate: daysAgo(220), preferredLanguage: "en", email: null,
    passwordHash: pw, passwordState: "ACTIVE" as const, privacyNoticeVersion: 0,
  };
  const meera = {
    id: id(), employeeId: "AE10024", name: "Meera Thomas", role: "LEARNER" as const,
    storeId: stores[0].id, managerId: joseph.id, groupIds: [groupId("Fresh Food")], jobTitle: "Bakery Assistant",
    hireDate: daysAgo(400), preferredLanguage: "en", email: null,
    passwordHash: pw, passwordState: "ACTIVE" as const, privacyNoticeVersion: 0,
  };
  const saeed = {
    id: id(), employeeId: "AE10025", name: "Saeed Al Shamsi", role: "LEARNER" as const,
    storeId: stores[1].id, managerId: fatima.id, groupIds: [groupId("Team Leader")], jobTitle: "Management Trainee",
    hireDate: daysAgo(60), preferredLanguage: "en", email: "saeed@demo.example",
    passwordHash: pw, passwordState: "ACTIVE" as const, privacyNoticeVersion: 0,
  };
  const priya = {
    id: id(), employeeId: "AE10026", name: "Priya Nair", role: "LEARNER" as const,
    storeId: stores[2].id, managerId: fatima.id, groupIds: [groupId("Pharmacy")], jobTitle: "Pharmacist",
    hireDate: daysAgo(800), preferredLanguage: "en", email: null,
    passwordHash: pw, passwordState: "ACTIVE" as const, privacyNoticeVersion: 0,
  };

  const named = [amina, joseph, fatima, farhan, meera, saeed, priya];
  const extraNames = [
    "Rashid Khan", "Elena Cruz", "Mohammed Iqbal", "Grace Fernandes", "Aisha Noor", "Daniel Perera",
    "Lakshmi Menon", "Omar Haddad", "Rosa Santos", "Vikram Shetty", "Noura Saleh", "John Varghese",
    "Sana Mirza", "Arun Pillai", "Layla Hassan", "Peter D'Souza", "Zainab Ali", "Kiran Kumar",
    "Maryam Aziz", "Thomas George", "Huda Salem", "Ravi Chandran",
  ];
  const jobs = ["Cashier", "Cashier", "Cashier", "Bakery Assistant", "Butcher", "Shelf Stocker", "Pharmacist", "Cashier"];
  const extras = extraNames.map((name, i) => ({
    id: id(),
    employeeId: `AE1${String(100 + i)}`,
    name,
    role: "LEARNER" as const,
    storeId: stores[i % 4].id,
    managerId: i % 4 <= 1 ? joseph.id : fatima.id,
    groupIds: [groupId(i % 8 === 6 ? "Pharmacy" : i % 4 === 3 ? "Fresh Food" : "Cashier")],
    jobTitle: jobs[i % jobs.length],
    hireDate: daysAgo(30 + i * 37),
    preferredLanguage: ["en", "en", "hi", "ml", "ar", "tl"][i % 6],
    email: null as string | null,
    passwordHash: pw,
    passwordState: "ACTIVE" as const,
    privacyNoticeVersion: 1,
  }));

  // one invited user to demo activation
  const inviteCode = activationCode();
  const invited = {
    id: id(), employeeId: "AE10099", name: "New Joiner Demo", role: "LEARNER" as const,
    storeId: stores[0].id, managerId: joseph.id, groupIds: [groupId("Cashier")], jobTitle: "Cashier",
    hireDate: new Date(), preferredLanguage: "en", email: null,
    passwordHash: null as string | null, passwordState: "INVITED" as const,
    inviteCodeHash: await bcrypt.hash(inviteCode, 10),
    inviteExpiresAt: new Date(Date.now() + 14 * 24 * 3600_000),
    privacyNoticeVersion: 0,
  };

  await db.insert(t.users).values([...named, ...extras, invited]);

  // ---- demo PDF asset
  const publicDir = resolve(process.cwd(), "public/demo");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    resolve(publicDir, "fire-safety-guide.pdf"),
    makePdf([
      { text: "Demo Retail Co.", size: 16, y: 500, bold: true, color: [0.32, 0.51, 0.4] },
      { text: "Fire & Emergency Quick Guide", size: 28, y: 430, bold: true },
      { text: "1. Raise the alarm and alert your supervisor immediately.", size: 13, y: 360 },
      { text: "2. Follow the green exit signs to the assembly point.", size: 13, y: 330 },
      { text: "3. Never use lifts during an evacuation.", size: 13, y: 300 },
      { text: "4. Only use an extinguisher if trained and the fire is small.", size: 13, y: 270 },
      { text: "5. Report to your assembly point marshal for the head count.", size: 13, y: 240 },
      { text: "DEMO material — replace with your reviewed emergency procedures.", size: 9, y: 80, color: [0.45, 0.45, 0.42] },
    ]),
  );

  // ---- courses
  function course(v: Partial<typeof t.courses.$inferInsert> & { id: string; title: string }) {
    return {
      description: "", status: "PUBLISHED" as const, language: "en", estMinutes: 15, tags: [] as string[],
      objectives: [] as string[], sequentialLock: false, certificateEnabled: false,
      certificateValidityDays: null as number | null, recertLeadDays: 30, createdBy: amina.id,
      publishedAt: new Date(), ...v,
    };
  }

  const cs = course({
    id: id(), title: "Customer Service Basics",
    description: "Greeting, listening, and resolving — the Demo Retail Co. service standard for every floor interaction.",
    estMinutes: 25, tags: ["service", "onboarding"], sequentialLock: true,
    objectives: ["Greet every customer within 10 seconds", "Handle a complaint calmly", "Escalate the right way"],
  });
  const fs_ = course({
    id: id(), title: "Food Safety Essentials",
    description: "Hygiene, temperature control, and allergen awareness for fresh-food sections.",
    estMinutes: 30, tags: ["compliance", "fresh-food"], certificateEnabled: true, certificateValidityDays: 365,
    objectives: ["Wash hands correctly", "Keep the cold chain intact", "Name the 9 major allergens"],
  });
  const fire = course({
    id: id(), title: "Fire & Emergency",
    description: "What to do in the first three minutes of an emergency — alarms, exits, assembly points.",
    estMinutes: 15, tags: ["compliance", "safety"], certificateEnabled: true, certificateValidityDays: 730,
    objectives: ["Raise the alarm correctly", "Evacuate by the nearest safe exit", "Report at the assembly point"],
  });
  const pos = course({
    id: id(), title: "POS & Cash Handling",
    description: "Registers, refunds, and till discipline for cashiers.",
    estMinutes: 20, tags: ["operations", "cashier"],
    objectives: ["Open and close a till", "Process a refund correctly", "Spot common payment errors"],
  });
  await db.insert(t.courses).values([cs, fs_, fire, pos]);

  // ---- modules + lessons (TEXT/PDF now; VIDEO/QUIZ wired by seed-videos/seed-assessments)
  type LessonSeed = { type: "TEXT" | "PDF"; title: string; body?: string; fileUrl?: string };
  async function addModule(courseId: string, title: string, sort: number, lessonSeeds: LessonSeed[]) {
    const moduleId = id();
    await db.insert(t.modules).values({ id: moduleId, courseId, title, sort });
    for (let i = 0; i < lessonSeeds.length; i++) {
      const ls = lessonSeeds[i];
      await db.insert(t.lessons).values({
        id: id(), moduleId, type: ls.type, title: ls.title, sort: i,
        payload: ls.type === "TEXT" ? { body: ls.body ?? "" } : { fileUrl: ls.fileUrl },
        searchText: ls.body ?? null,
      });
    }
    return moduleId;
  }

  await addModule(cs.id, "The greeting standard", 0, [
    {
      type: "TEXT", title: "Why the first 10 seconds matter",
      body: "# The 10-second rule\n\nEvery customer who enters your section should be **acknowledged within 10 seconds** — a smile, eye contact, or a simple \"marhaba, welcome\".\n\n- Acknowledge even when busy: a nod says *I've seen you*\n- Pause restocking when a customer approaches\n- If you can't help, walk them to someone who can\n\n## The Demo Retail greeting\n\n1. Smile and make eye contact\n2. Greet: \"Welcome! How can I help?\"\n3. Listen fully before answering",
    },
    {
      type: "TEXT", title: "Handling a complaint calmly",
      body: "# LAST: our complaint method\n\n**L**isten — let the customer finish, never interrupt.\n\n**A**pologize — \"I'm sorry this happened\" costs nothing and calms most situations.\n\n**S**olve — fix what you can on the spot: replace, refund per policy, or fetch your team leader.\n\n**T**hank — thank them for telling us; most unhappy customers simply leave.\n\nIf a customer raises their voice, stay calm, lower yours, and call your team leader early — *escalating early is professional, not a failure*.",
    },
  ]);

  await addModule(fs_.id, "Personal hygiene", 0, [
    {
      type: "TEXT", title: "Handwashing that actually works",
      body: "# Wash like it matters\n\nWet hands, apply soap, and scrub for **at least 20 seconds** — palms, backs, between fingers, thumbs, nails — then rinse and dry with a single-use towel.\n\nWash **before** starting your shift and handling food, and **after** breaks, the toilet, touching your face or phone, handling waste, or handling raw meat.\n\n## Gloves are not magic\n\nGloves protect food only if you change them as often as you would wash your hands.",
    },
    {
      type: "TEXT", title: "The cold chain",
      body: "# Keep it cold\n\nChilled food lives **below 5°C**; frozen food **below −18°C**. The danger zone is **5°C to 60°C** — bacteria double every 20 minutes there.\n\n- Check and log display-fridge temperatures at shift start\n- Never leave deliveries on the dock — chilled goods go straight to the cold room\n- If a fridge reads warm, tell your team leader immediately and move the stock",
    },
  ]);

  await addModule(fire.id, "The first three minutes", 0, [
    {
      type: "TEXT", title: "Alarm, exits, assembly",
      body: "# When the alarm sounds\n\n1. **Stop serving** — safety beats sales, always\n2. Guide customers to the **nearest green-signed exit**\n3. **Never use lifts**\n4. Go to your assembly point and **report to the marshal**\n\nKnow your section's two nearest exits *before* you ever need them.",
    },
    { type: "PDF", title: "Quick guide (printable)", fileUrl: "/demo/fire-safety-guide.pdf" },
  ]);

  await addModule(pos.id, "Till discipline", 0, [
    {
      type: "TEXT", title: "Opening and closing a till",
      body: "# Your till, your responsibility\n\n**Opening:** count the float with a witness, sign the float sheet, check the receipt roll.\n\n**During:** keep notes under the clip, large notes go under the drawer, never leave the till unlocked.\n\n**Closing:** count with your team leader, record variance honestly — an honest AED 5 variance is a note; a hidden one is a disciplinary issue.",
    },
    {
      type: "TEXT", title: "Refunds done right",
      body: "# Refunds\n\nRefunds need: the item, proof of purchase, and a team-leader approval above **AED 200**.\n\n- Refund to the **original payment method** only\n- Card refunds go back to the same card — never cash\n- Suspected fraud? Don't accuse — call your team leader with a smile",
    },
  ]);

  // ---- path
  const onboarding = { id: id(), title: "New Associate Onboarding", description: "Your first two weeks at Demo Retail Co.", completeInOrder: true };
  await db.insert(t.paths).values(onboarding);
  await db.insert(t.pathCourses).values([
    { id: id(), pathId: onboarding.id, courseId: cs.id, sort: 0 },
    { id: id(), pathId: onboarding.id, courseId: fs_.id, sort: 1 },
  ]);

  // ---- auto-enrollment rule: all Cashiers → POS, due 14 days from enrollment
  await db.insert(t.enrollmentRules).values({
    id: id(), name: "Cashiers → POS & Cash Handling",
    criteria: { groupId: groupId("Cashier") }, targetType: "course", targetId: pos.id,
    dueRule: { kind: "from_enrollment", days: 14 }, active: true,
  });

  // manual enrollments: onboarding path for Farhan & Saeed; Food Safety for Meera (due soon)
  const { enrollUser } = await import("../lib/lms/rules");
  await enrollUser(farhan.id, { type: "path", id: onboarding.id }, "manual", null, new Date(Date.now() + 10 * 24 * 3600_000));
  await enrollUser(saeed.id, { type: "path", id: onboarding.id }, "manual", null, new Date(Date.now() + 20 * 24 * 3600_000));
  await enrollUser(meera.id, { type: "course", id: fs_.id }, "manual", null, new Date(Date.now() + 3 * 24 * 3600_000));
  // one overdue learner for the manager dashboard
  await enrollUser(extras[0].id, { type: "course", id: fire.id }, "manual", null, new Date(Date.now() - 5 * 24 * 3600_000));

  // ---- staged expiring certificate (recert loop demo): Priya completed Food Safety ~11 months ago
  const { certificateSerial } = await import("../lib/ids");
  const completedAt = daysAgo(340);
  await db.insert(t.enrollments).values({
    id: id(), userId: priya.id, courseId: fs_.id, source: "manual", sourceId: null,
    dueAt: daysAgo(330), status: "COMPLETED", complianceStatus: "COMPLETED",
    completedAt, createdAt: daysAgo(360),
  });
  await db.insert(t.completionRecords).values({ id: id(), userId: priya.id, courseId: fs_.id, completedAt });
  await db.insert(t.certificates).values({
    id: id(), userId: priya.id, courseId: fs_.id, kind: "internal",
    issuedAt: completedAt, expiresAt: new Date(completedAt.getTime() + 365 * 24 * 3600_000),
    serial: certificateSerial(),
  });

  // ---- rule evaluation + assessments + videos + HR corpus + first sweep
  await reevaluateAllUsers();
  await seedVideos({ courseIds: { customerService: cs.id, foodSafety: fs_.id } });
  await seedAssessments({ courseIds: { customerService: cs.id, foodSafety: fs_.id, fire: fire.id, pos: pos.id }, learnerIds: { farhan: farhan.id, meera: meera.id } });
  await seedHrCorpus(amina.id);
  await ensureDemoContentLessons();
  await ensureDemoInterviewLessons();
  const sweepStats = await runDailySweep();

  console.log("\n=== Demo credentials (password: demo1234) ===");
  console.log("  Admin    AE90001  Amina Al Mansouri (TOTP setup on first login)");
  console.log("  Manager  AE20001  Joseph Mathew");
  console.log("  Manager  AE20002  Fatima Rahman");
  console.log("  Learner  AE10023  Farhan Sheikh (onboarding path, no email)");
  console.log("  Learner  AE10024  Meera Thomas (Food Safety due soon)");
  console.log("  Learner  AE10026  Priya Nair (certificate expiring → recert)");
  console.log(`  Invited  AE10099  activation code: ${inviteCode}`);
  console.log("\nSweep:", JSON.stringify(sweepStats));
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
