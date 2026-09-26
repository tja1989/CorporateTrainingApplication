import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  vector,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Identity & org
// ---------------------------------------------------------------------------

export const orgUnits = pgTable("org_units", {
  id: text("id").primaryKey(),
  type: text("type").$type<"country" | "region" | "store">().notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Dubai"),
});

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<"ADMIN" | "MANAGER" | "LEARNER">().notNull(),
    storeId: text("store_id"),
    managerId: text("manager_id"),
    groupIds: jsonb("group_ids").$type<string[]>().notNull().default([]),
    jobTitle: text("job_title"),
    hireDate: timestamp("hire_date", { withTimezone: true }),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    email: text("email"),
    passwordHash: text("password_hash"),
    passwordState: text("password_state").$type<"INVITED" | "ACTIVE">().notNull().default("INVITED"),
    inviteCodeHash: text("invite_code_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    timeMultiplier: real("time_multiplier").notNull().default(1.0),
    quietHours: jsonb("quiet_hours").$type<{ start: string; end: string } | null>(),
    totpSecret: text("totp_secret"),
    privacyNoticeVersion: integer("privacy_notice_version").notNull().default(0),
    erasedAt: timestamp("erased_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_employee_id_uniq").on(t.employeeId)],
);

export const loginAttempts = pgTable("login_attempts", {
  id: text("id").primaryKey(),
  key: text("key").notNull(), // employee_id or ip
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  success: boolean("success").notNull(),
});

export const consents = pgTable("consents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").$type<"privacy_notice" | "integrity" | "escalation" | "voice">().notNull(),
  version: text("version").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const courses = pgTable("courses", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  coverUrl: text("cover_url"),
  status: text("status").$type<"DRAFT" | "PUBLISHED" | "ARCHIVED">().notNull().default("DRAFT"),
  language: text("language").notNull().default("en"),
  estMinutes: integer("est_minutes").notNull().default(15),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
  sequentialLock: boolean("sequential_lock").notNull().default(false),
  certificateEnabled: boolean("certificate_enabled").notNull().default(false),
  certificateValidityDays: integer("certificate_validity_days"),
  recertLeadDays: integer("recert_lead_days").notNull().default(30),
  createdBy: text("created_by"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modules = pgTable("modules", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull(),
  title: text("title").notNull(),
  sort: integer("sort").notNull().default(0),
});

/** Admin-configured oral check (spec FR-14.2 v1.4) — an INTERVIEW lesson's settings. */
export type InterviewConfig = {
  questionCount: number; // 1–6
  passPct: number; // 50–100
  maxMinutes: number; // 3–9, scaled by the learner's time multiplier
  scope: "previous" | "module" | "course"; // which lesson content the interviewer may ask about
  focus?: string; // topics / instructions for the interviewer
  requirePass: boolean; // when true the lesson completes only on a pass
};

export type LessonPayload = {
  videoId?: string; // -> videos.id (VIDEO)
  body?: string; // markdown (TEXT)
  fileUrl?: string; // (PDF)
  quizId?: string; // -> quizzes.id (QUIZ)
  interview?: InterviewConfig; // (INTERVIEW)
};

export const lessons = pgTable("lessons", {
  id: text("id").primaryKey(),
  moduleId: text("module_id").notNull(),
  type: text("type").$type<"VIDEO" | "TEXT" | "PDF" | "QUIZ" | "INTERVIEW">().notNull(),
  title: text("title").notNull(),
  sort: integer("sort").notNull().default(0),
  payload: jsonb("payload").$type<LessonPayload>().notNull().default({}),
  searchText: text("search_text"),
});

export const videos = pgTable("videos", {
  id: text("id").primaryKey(),
  youtubeId: text("youtube_id").notNull().unique(),
  title: text("title").notNull().default(""),
  durationSec: integer("duration_sec").notNull().default(0),
  transcriptLang: text("transcript_lang").notNull().default("en"),
  transcriptSource: text("transcript_source")
    .$type<"manual" | "vendor" | "scraper" | "official">()
    .notNull()
    .default("manual"),
  isGenerated: boolean("is_generated").notNull().default(false),
  ingestionStatus: text("ingestion_status")
    .$type<"PENDING" | "FETCHING" | "CHUNKING" | "EMBEDDING" | "READY" | "FAILED">()
    .notNull()
    .default("PENDING"),
  failureReason: text("failure_reason"),
  lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const videoChunks = pgTable(
  "video_chunks",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(),
    startSec: integer("start_sec").notNull(),
    endSec: integer("end_sec").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
  },
  (t) => [index("video_chunks_video_idx").on(t.videoId)],
);

export const paths = pgTable("paths", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  completeInOrder: boolean("complete_in_order").notNull().default(false),
});

export const pathCourses = pgTable("path_courses", {
  id: text("id").primaryKey(),
  pathId: text("path_id").notNull(),
  courseId: text("course_id").notNull(),
  sort: integer("sort").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Enrollment & compliance
// ---------------------------------------------------------------------------

export type RuleCriteria = {
  country?: string;
  region?: string;
  store?: string;
  groupId?: string;
  jobTitle?: string;
  hiredAfter?: string;
  hiredBefore?: string;
};
export type DueRule =
  | { kind: "fixed"; date: string }
  | { kind: "from_enrollment"; days: number }
  | { kind: "from_hire"; days: number };

export const enrollmentRules = pgTable("enrollment_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  criteria: jsonb("criteria").$type<RuleCriteria>().notNull().default({}),
  targetType: text("target_type").$type<"course" | "path">().notNull(),
  targetId: text("target_id").notNull(),
  dueRule: jsonb("due_rule").$type<DueRule | null>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ComplianceStatus =
  | "ON_TRACK"
  | "DUE_SOON"
  | "OVERDUE"
  | "COMPLETED"
  | "COMPLETED_EXPIRING"
  | "EXPIRED"
  | "WITHDRAWN";

export const enrollments = pgTable(
  "enrollments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    courseId: text("course_id").notNull(),
    source: text("source").$type<"manual" | "rule" | "path" | "recert">().notNull(),
    sourceId: text("source_id"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status")
      .$type<"NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WITHDRAWN">()
      .notNull()
      .default("NOT_STARTED"),
    complianceStatus: text("compliance_status").$type<ComplianceStatus>().notNull().default("ON_TRACK"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("enrollments_user_idx").on(t.userId),
    index("enrollments_course_idx").on(t.courseId),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    status: text("status").$type<"NOT_STARTED" | "IN_PROGRESS" | "COMPLETED">().notNull().default("NOT_STARTED"),
    watchedBuckets: jsonb("watched_buckets").$type<number[]>(), // 5s bucket indices
    lastPositionSec: real("last_position_sec"), // resume only; never used as watched coverage
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lesson_progress_uniq").on(t.userId, t.lessonId)],
);

export const completionRecords = pgTable("completion_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  score: real("score"),
});

export const certificates = pgTable("certificates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  kind: text("kind").$type<"internal" | "external_tracked">().notNull().default("internal"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  serial: text("serial").notNull().unique(),
  recertTriggeredAt: timestamp("recert_triggered_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export const questionBanks = pgTable("question_banks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  courseId: text("course_id"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
});

export type QuestionBody = {
  prompt: string;
  stimulus?: string;
  options?: string[]; // mcq_single / mcq_multi / truefalse implied
  correct?: number[]; // indices for mcq; [0]=true,[1]=false for truefalse
  acceptedAnswers?: string[]; // fill_blank
  pairs?: { left: string; right: string }[]; // matching
  orderItems?: string[]; // ordering (correct order)
  lockedOptionIndices?: number[]; // choices that never shuffle (e.g. "All of the above")
  explanation?: string;
  sourceStartSec?: number;
};
export type Rubric = { criteria: { name: string; points: number }[]; modelAnswer: string };

export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").notNull(),
  type: text("type")
    .$type<"mcq_single" | "mcq_multi" | "truefalse" | "fill_blank" | "matching" | "ordering" | "free_text">()
    .notNull(),
  status: text("status").$type<"DRAFT" | "APPROVED" | "RETIRED">().notNull().default("DRAFT"),
  points: integer("points").notNull().default(1),
  body: jsonb("body").$type<QuestionBody>().notNull(),
  rubric: jsonb("rubric").$type<Rubric | null>(),
  source: jsonb("source").$type<{ videoId?: string; startSec?: number } | null>(),
  createdBy: text("created_by").$type<"human" | "ai">().notNull().default("human"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type QuizSettings = {
  attemptsLimit: number | null; // null = unlimited
  cooldownMinutes: number;
  gradingMethod: "highest" | "latest" | "first" | "average";
  passPct: number;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  oneAtATime: boolean;
  noBacktrack: boolean;
  feedbackMode: "PRACTICE" | "EXAM";
  availableFrom?: string | null;
  availableUntil?: string | null;
  answersReleasedAt?: string | null;
  timeLimitSec?: number | null;
  graceSec: number;
  integrityMode: boolean;
};
export type QuizSection = { fixed?: string[]; bankId?: string; pickN?: number };

export const quizzes = pgTable("quizzes", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id"),
  title: text("title").notNull().default("Quiz"),
  settings: jsonb("settings").$type<QuizSettings>().notNull(),
  sections: jsonb("sections").$type<QuizSection[]>().notNull().default([]),
});

export type ServedItem = {
  questionId: string;
  order: number;
  choiceOrder?: number[]; // shuffled option indices as served
};

export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id").notNull(),
    userId: text("user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    servedItems: jsonb("served_items").$type<ServedItem[]>().notNull(),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
    score: real("score"),
    maxScore: real("max_score"),
    passed: boolean("passed"),
    gradingState: text("grading_state").$type<"PROVISIONAL" | "FINAL">().notNull().default("FINAL"),
    state: text("state")
      .$type<"IN_PROGRESS" | "SUBMITTED" | "GRADED" | "CLEARED" | "VOIDED">()
      .notNull()
      .default("IN_PROGRESS"),
    voidReason: text("void_reason"),
    integrityMode: boolean("integrity_mode").notNull().default(false),
  },
  (t) => [index("attempts_quiz_user_idx").on(t.quizId, t.userId)],
);

export const gradingReviews = pgTable("grading_reviews", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull(),
  questionId: text("question_id").notNull(),
  aiScores: jsonb("ai_scores").$type<{ criterion: string; points: number; max: number }[]>(),
  aiRationale: text("ai_rationale"),
  aiConfidence: real("ai_confidence"),
  reason: text("reason").$type<"ai_fail" | "low_conf" | "borderline" | "appeal">().notNull(),
  state: text("state").$type<"PENDING" | "CONFIRMED" | "ADJUSTED">().notNull().default("PENDING"),
  reviewerId: text("reviewer_id"),
  finalScores: jsonb("final_scores").$type<{ criterion: string; points: number; max: number }[]>(),
  modelVersion: text("model_version"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrityEvents = pgTable(
  "integrity_events",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    severity: text("severity").$type<"red" | "orange" | "info">().notNull().default("info"),
  },
  (t) => [index("integrity_events_attempt_idx").on(t.attemptId)],
);

export const drillState = pgTable(
  "drill_state",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    questionId: text("question_id").notNull(),
    intervalDays: real("interval_days").notNull().default(0),
    ease: real("ease").notNull().default(2.5),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    streak: integer("streak").notNull().default(0),
    lastConfidence: text("last_confidence").$type<"sure" | "unsure" | null>(),
  },
  (t) => [uniqueIndex("drill_state_uniq").on(t.userId, t.questionId)],
);

export const streakState = pgTable(
  "streak_state",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    weekStart: text("week_start").notNull(), // ISO date of Monday
    daysActive: jsonb("days_active").$type<string[]>().notNull().default([]),
    freezesUsedMonth: integer("freezes_used_month").notNull().default(0),
    currentStreakWeeks: integer("current_streak_weeks").notNull().default(0),
  },
  (t) => [uniqueIndex("streak_state_uniq").on(t.userId, t.weekStart)],
);

// ---------------------------------------------------------------------------
// HR assistant
// ---------------------------------------------------------------------------

export const policyDocs = pgTable("policy_docs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  country: text("country").notNull().default("AE"),
  audience: text("audience").$type<"all" | "managers">().notNull().default("all"),
  language: text("language").notNull().default("en"),
  version: integer("version").notNull().default(1),
  effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull(),
  supersededDate: timestamp("superseded_date", { withTimezone: true }),
  owner: text("owner").notNull().default(""),
  reviewDue: timestamp("review_due", { withTimezone: true }),
  body: text("body").notNull(), // markdown source
  status: text("status").$type<"ACTIVE" | "SUPERSEDED">().notNull().default("ACTIVE"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const policyChunks = pgTable(
  "policy_chunks",
  {
    id: text("id").primaryKey(),
    docId: text("doc_id").notNull(),
    sectionPath: text("section_path").notNull(),
    parentText: text("parent_text").notNull().default(""),
    text: text("text").notNull(),
    superseded: boolean("superseded").notNull().default(false),
    embedding: vector("embedding", { dimensions: 1024 }),
  },
  (t) => [index("policy_chunks_doc_idx").on(t.docId)],
);

export const hrConversations = pgTable("hr_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  language: text("language").notNull().default("en"),
  mode: text("mode").$type<"text" | "voice">().notNull().default("text"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HrCitation = { docId: string; title: string; sectionPath: string; version: number; effectiveDate: string };
/** A citation into the learner's own course content (voice assistant, spec FR-14.3 v1.4). */
export type LessonCitation = { kind: "lesson"; title: string; lessonId: string; courseTitle: string; href: string };
/** What the voice assistant cites: policy sections (default kind) or lessons. */
export type LiveCitation = (HrCitation & { kind?: "policy" }) | LessonCitation;

export const hrMessages = pgTable(
  "hr_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    role: text("role").$type<"user" | "assistant" | "system">().notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<LiveCitation[]>(),
    feedback: text("feedback").$type<"up" | "down" | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hr_messages_conv_idx").on(t.conversationId)],
);

export const hrAuditLog = pgTable("hr_audit_log", {
  id: text("id").primaryKey(),
  pseudoId: text("pseudo_id").notNull(),
  language: text("language").notNull(),
  query: text("query").notNull(),
  piiRedacted: boolean("pii_redacted").notNull().default(false),
  chunkIds: jsonb("chunk_ids").$type<string[]>().notNull().default([]),
  answer: text("answer").notNull().default(""),
  citations: jsonb("citations").$type<HrCitation[]>(),
  confidence: real("confidence"),
  guardrail: text("guardrail"),
  escalated: boolean("escalated").notNull().default(false),
  feedback: text("feedback"),
  modelVersion: text("model_version"),
  promptVersion: text("prompt_version"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});

export const hrTickets = pgTable("hr_tickets", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  userId: text("user_id").notNull(),
  subject: text("subject").notNull(),
  state: text("state").$type<"OPEN" | "IN_PROGRESS" | "RESOLVED">().notNull().default("OPEN"),
  assigneeId: text("assignee_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hrTicketMessages = pgTable("hr_ticket_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------

export const tutorThreads = pgTable("tutor_threads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  lessonId: text("lesson_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TutorCitation = { startSec: number; endSec: number; quote: string; videoId?: string; lessonId?: string; lessonTitle?: string };

export const tutorMessages = pgTable(
  "tutor_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<TutorCitation[]>(),
    feedback: text("feedback").$type<"up" | "down" | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tutor_messages_thread_idx").on(t.threadId)],
);

// ---------------------------------------------------------------------------
// Live voice (spec FR-14): oral checks. HR voice conversations reuse hr_* tables.
// ---------------------------------------------------------------------------

export type LiveTurn = { role: "user" | "assistant"; text: string; at?: string; citations?: LiveCitation[]; mock?: boolean };
export type LiveEvaluation = {
  questions: Array<{ question: string; answer_summary: string; score: number; feedback: string }>;
  overall_summary: string;
  language?: string;
};

export const liveInterviews = pgTable(
  "live_interviews",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    courseId: text("course_id").notNull(),
    state: text("state").$type<"IN_PROGRESS" | "COMPLETED" | "ABANDONED">().notNull().default("IN_PROGRESS"),
    model: text("model").notNull(),
    mock: boolean("mock").notNull().default(false),
    questionCount: integer("question_count").notNull().default(3),
    maxMinutes: integer("max_minutes").notNull().default(6),
    passPct: integer("pass_pct").notNull().default(67),
    transcript: jsonb("transcript").$type<LiveTurn[]>().notNull().default([]),
    evaluation: jsonb("evaluation").$type<LiveEvaluation>(),
    evaluationSource: text("evaluation_source").$type<"model" | "fallback" | "mock">(),
    scorePct: integer("score_pct"),
    outcome: text("outcome").$type<"PASS" | "FAIL">(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("live_interviews_user_lesson_idx").on(t.userId, t.lessonId)],
);

// ---------------------------------------------------------------------------
// Platform: telemetry, gamification, notifications, jobs
// ---------------------------------------------------------------------------

export const aiCallLog = pgTable("ai_call_log", {
  id: text("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  route: text("route").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estCost: real("est_cost").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  promptVersion: text("prompt_version"),
});

export const uiEvents = pgTable("ui_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  kind: text("kind").notNull(), // citation_click | tutor_open | ...
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
});

export const pointsLedger = pgTable("points_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  kind: text("kind").notNull(),
  refId: text("ref_id"),
  amount: integer("amount").notNull(),
});

export const badges = pgTable(
  "badges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    badge: text("badge").$type<"first_course" | "five_courses" | "four_week_streak" | "perfect_quiz">().notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("badges_uniq").on(t.userId, t.badge)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    channels: jsonb("channels").$type<string[]>().notNull().default(["inapp"]),
    readAt: timestamp("read_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    dedupeKey: text("dedupe_key"),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    state: text("state").$type<"queued" | "running" | "done" | "failed">().notNull().default("queued"),
    error: text("error"),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_state_idx").on(t.state, t.runAfter)],
);

export const reportViews = pgTable("report_views", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  report: text("report").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  name: text("name").notNull(),
});
