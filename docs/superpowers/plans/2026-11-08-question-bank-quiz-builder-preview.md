# Question Bank, Quiz Builder and Instructor Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instructors, HR Head and Admin get a shared Question Bank. Authors build and edit quizzes from picked, newly written and random-drawn questions. Anyone who can open a course in a workspace can preview it as a learner and take its quizzes, with nothing saved.

**Architecture:**
- **Pure rules and validation** live in `lib/questions/*` and `lib/quiz/composition.ts`, and are unit-tested.
- **Transactional services** reuse the existing curriculum locks (`lockAssessmentCurriculum`, `lockCurriculum`) and `mutateDraftCourse`.
- **One shared Question Bank UI** is mounted per workspace, the way `CourseEditor` is.
- **Preview** is a separate `app/(preview)` route group. It reads with `select` only, and scores quizzes with the existing scoring functions.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, Drizzle ORM on Postgres, Tailwind 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-question-bank-quiz-builder-preview-design.md`. Read it first: the decisions, anti-goals and Claude's calls are binding.

## Global Constraints

- **Branch:** work on `feature/question-bank-preview`, never on `main`. Commit after each task.
- **Permission:** `question.author` goes to ADMIN, HR_HEAD and INSTRUCTOR only. Every bank, question and quiz server action re-checks permissions on the server.
- **Question visibility:** only `status = "APPROVED"` questions are pickable or listed in the bank. AI drafts keep the existing `/admin/reviews` flow.
- **Instructor-written questions** are stored `status: "APPROVED"`, `createdBy: "human"`, `authorId: actor.id`.
- **Live course:** `status === "PUBLISHED" || approvalState in ("SUBMITTED", "APPROVED")`. **Draft course:** `status === "DRAFT"` and not live. Archived courses are neither; ignore them in blocking and bumping.
- **Random-draw block:** adding a question to a bank is refused when a live course has a quiz with a `{ bankId, pickN }` section on that bank. Only random-draw sections count. A bank's `courseId` and `fixed` references don't block.
- **Edit rule:** editing is allowed only when all of these hold:
  - the actor is the author, or is HR_HEAD or ADMIN;
  - the question was never served in any attempt;
  - no live course references it through `fixed` or a random draw on its bank.
  Otherwise the UI offers "Copy and edit": the new-question form, prefilled, with the bank still changeable.
- **Draft course bump:** any write that changes what a draft course serves bumps `contentRevision` and resets approval, exactly as `mutateDraftCourse` and `updateDraftQuestion` do today.
- **Preview writes nothing:** no insert, update or delete on any table, ever.
- **Copy text (exact):**
  - nav label `Question bank`
  - banner `Preview — nothing is saved`
  - button `Back to editor`
  - editor button `Preview as learner`
  - badge `Used in a live exam`
  - confirm text `Learners will see these answers right after submitting.`
- **UI:** follow `DESIGN.md` and the existing `components/ui.tsx` and `components/workspace-ui.tsx` primitives. No page overflow at 360px wide.

## Review Focus

The spec implies these, but no task's main tests exercise them. Each has a test added in its owning task.

1. **Stale form or concurrent edit.** Saving a quiz after the course changed must show "This course changed. Reload before saving." and keep the old content. (Task 5)
2. **More random draws than the bank holds.** If a bank has 3 approved questions and the rule asks for 5, the builder warns, and preview serves 3 without crashing. (Tasks 5, 7)
3. **A Department Head submits a preview with question ids outside the quiz.** The submission is rejected, so a Department Head can't read answer keys for arbitrary questions. (Task 7)
4. **Shuffled choices in preview.** Answers are scored against the true option indices (`unmapAnswer`), not the displayed order. (Task 7)
5. **Empty and long content.** Previewing a course with no modules shows an empty message. Long, unbroken prompts or options don't overflow the bank, builder or preview at mobile width. (Tasks 8, 9)

---

### Task 1: Permission, author column, migration and navigation

**Files:**
- Modify: `lib/auth/permissions.ts` (add `"question.author"` to `Permission` and to the ADMIN, HR_HEAD and INSTRUCTOR grants)
- Modify: `lib/db/schema.ts` (`questions`: add `authorId: text("author_id")`)
- Create: `migrations/20261108_question_authors.sql`
- Modify: `scripts/deploy-init.ts` (run the new migration after `20261015_course_planning.sql`, with a log line)
- Modify: `scripts/qa-client-migration.ts` (append the new file to its migration list)
- Modify: `lib/navigation.ts` (add `Question bank` items)
- Test: `tests/question-bank-access.test.ts`

**Interfaces:**
- Produces: `hasPermission(role, "question.author")`.
- Produces: `questionBankPath(role: Role): "/admin/questions" | "/hr/questions" | "/instructor/questions"`, exported from `lib/navigation.ts`. It throws for DEPARTMENT_HEAD and LEARNER.

- [ ] **Step 1: Write the failing tests** in `tests/question-bank-access.test.ts`.
  - `grants question.author only to authors`: true for ADMIN, HR_HEAD and INSTRUCTOR; false for DEPARTMENT_HEAD and LEARNER.
  - `nav shows Question bank to authors`: `workspaceNavigation("INSTRUCTOR")` contains `{ href: "/instructor/questions", label: "Question bank", icon: "note" }`. HR_NAV has `/hr/questions` and ADMIN_NAV has `/admin/questions` (group `"Learning"`). DEPARTMENT_NAV has no `/questions` entry.
  - `questionBankPath maps roles`: covers each mapping, and throws for DEPARTMENT_HEAD.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run tests/question-bank-access.test.ts` should FAIL.
- [ ] **Step 3: Implement** the grants, the nav items and `questionBankPath`.
- [ ] **Step 4: Add the schema column and write the migration.** Follow the style of `migrations/20261015_course_planning.sql` (`BEGIN … COMMIT`, idempotent):
  ```sql
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS author_id text REFERENCES users(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS questions_author_idx ON questions(author_id);
  CREATE INDEX IF NOT EXISTS questions_bank_status_idx ON questions(bank_id, status);
  ```
  Add a short section to `migrations/README.md` covering: additive, repeatable, no backfill (seed and AI rows stay null), and rollback leaves the column.
- [ ] **Step 5: Run the tests and typecheck.** `npx vitest run tests/question-bank-access.test.ts && npm run typecheck` should PASS.
- [ ] **Step 6: Commit.** `feat: question.author permission, question author column and bank nav`

### Task 2: Question form validation (all 7 types)

**Files:**
- Create: `lib/questions/validate.ts`
- Test: `tests/question-validate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QuestionType = (typeof t.questions.$inferSelect)["type"];
  export type QuestionDraft = { type: QuestionType; points: number; body: QuestionBody; rubric: Rubric | null };
  export function parseQuestionForm(form: FormData): { ok: true; value: QuestionDraft } | { ok: false; error: string };
  export function draftToFormDefaults(q: QuestionDraft): Record<string, string | string[]>; // used by "Copy and edit" and "Edit" to prefill
  ```
- **Form field names (the Task 4 editor emits exactly these):**
  - `type`, `prompt`, `stimulus`, `explanation`, `points`
  - repeated `option`; repeated `correct` (0-based option indices); repeated `locked` (option indices)
  - `truefalse` (`"true"` or `"false"`)
  - repeated `accepted`
  - repeated `left` and `right` (paired by position)
  - repeated `orderItem` (in correct order)
  - repeated `criterionName` and `criterionPoints` (paired); `modelAnswer`
- Trim every string and drop empty repeated rows before validating.

- [ ] **Step 1: Write the failing tests.** One `it` per type for a valid input, checking the exact stored shape:
  - Single choice and multiple choice store `body.options`, `body.correct` and `body.lockedOptionIndices` (omitted when there are none).
  - True/false stores `body.correct` as `[0]` for true and `[1]` for false, and no `options`.
  - Fill in the blank stores `body.acceptedAnswers`.
  - Matching stores `body.pairs: [{ left, right }]`.
  - Ordering stores `body.orderItems`.
  - Written answer stores `rubric: { criteria: [{ name, points }], modelAnswer }`, and `body` holds only prompt, scenario and explanation.
  - Every other type has `rubric: null`.

  Error cases, with these exact messages:
  - empty prompt: `"Enter the question."`
  - unknown type: `"Choose a question type."`
  - points below 1 or not a whole number: `"Points must be a whole number of 1 or more."`
  - single choice with one option: `"Add at least two answer choices."`
  - single choice with 0 or 2 correct: `"Mark exactly one correct answer."`
  - multiple choice with none correct: `"Mark at least one correct answer."`
  - a correct index out of range: `"Mark at least one correct answer."`
  - true/false missing: `"Choose whether the statement is true or false."`
  - fill in the blank with no accepted answers: `"Add at least one accepted answer."`
  - matching with fewer than 2 complete pairs: `"Add at least two complete pairs."`
  - ordering with fewer than 2 items: `"Add at least two steps in the correct order."`
  - written answer with no criteria: `"Add at least one marking criterion with points."`
  - written answer with no model answer: `"Add a model answer."`

  Also test that `draftToFormDefaults` round-trips through `parseQuestionForm` for every type.
- [ ] **Step 2: Run and confirm they fail.** `npx vitest run tests/question-validate.test.ts` should FAIL.
- [ ] **Step 3: Implement `parseQuestionForm` and `draftToFormDefaults`.** Points default to 1 when the field is blank.
- [ ] **Step 4: Run and confirm they pass.**
- [ ] **Step 5: Commit.** `feat: validate instructor-written questions for all seven types`

### Task 3: Bank services (usage, create bank, create, edit)

**Files:**
- Create: `lib/questions/usage.ts` (read-only lookups)
- Create: `lib/questions/rules.ts` (pure decision functions)
- Create: `lib/questions/bank.ts` (transactional writes)
- Modify: `lib/courses/questions.ts` (extract the course-reopen loop into `reopenDraftCourses` and use it in `updateDraftQuestion`; no behavior change)
- Test: `tests/question-rules.test.ts`, `tests/question-bank-service.test.ts` (mocked `db`, following `tests/course-workflow-actions.test.ts`)

**Interfaces:**
- Produces from `lib/questions/rules.ts` (pure):
  ```ts
  export type CourseState = { id: string; title: string; status: string; approvalState: string };
  export function isLiveCourse(c: Pick<CourseState, "status" | "approvalState">): boolean;
  export function isDraftCourse(c: Pick<CourseState, "status" | "approvalState">): boolean;
  export function editBlockReason(i: { actor: Actor; authorId: string | null; servedCount: number; liveCourseTitles: string[] }): string | null;
  ```
  The reasons, in this order:
  1. `"Only the author, HR Head or Admin can edit this question."`
  2. `"Learners have already answered this question. Copy it to make changes."`
  3. ``"Used by live training: ${titles.join(", ")}. Copy it to make changes."``
- Produces from `lib/questions/usage.ts`:
  ```ts
  export type UsageRef = { courseId: string; courseTitle: string; lessonId: string; quizTitle: string; via: "picked" | "random"; live: boolean; exam: boolean };
  export async function questionUsage(questionIds: string[], conn?: LearningDatabase): Promise<Map<string, UsageRef[]>>;
  export async function randomDrawCourses(bankId: string, conn?: LearningDatabase): Promise<CourseState[]>;
  export async function servedCount(questionId: string, conn?: LearningDatabase): Promise<number>; // attempts.served_items @> '[{"questionId": id}]'
  export async function liveExamQuestionIds(questionIds: string[], conn?: LearningDatabase): Promise<Set<string>>; // live course + feedbackMode EXAM, via picked or random
  ```
  Join quizzes to courses through `lessons.payload->>'quizId'` → `lessons.module_id` → `modules.course_id`, the same join as `updateDraftQuestion`.
- Produces from `lib/courses/questions.ts`: `reopenDraftCourses(tx: LearningTransaction, courseIds: string[]): Promise<void>`. It locks each course (sorted), throws the existing "Revise affected courses…" error for a non-draft, and bumps revision and resets approval.
- Produces from `lib/questions/bank.ts` (each runs in `db.transaction`, calls `lockAssessmentCurriculum(tx)` first, and re-reads the actor as `updateDraftQuestion` does, requiring `question.author`):
  ```ts
  export async function createBank(actor: Actor, input: { name: string; tags: string[] }): Promise<string>;
  export async function createQuestion(actor: Actor, bankId: string, draft: QuestionDraft): Promise<string>;
  export async function editQuestion(actor: Actor, questionId: string, draft: QuestionDraft): Promise<void>; // version + 1
  ```

- [ ] **Step 1: Write the failing rule tests.**
  - `isLiveCourse` is true for PUBLISHED, and for DRAFT with SUBMITTED or APPROVED; false for DRAFT with DRAFT or REJECTED, and for ARCHIVED.
  - `editBlockReason` returns each reason in its precedence order, returns null for the author when served 0 with no live courses, and returns null for HR_HEAD on someone else's question.
- [ ] **Step 2: Write the failing service tests.**
  - `createBank` with a name that matches an existing bank ignoring case and spaces throws `"A bank with this name already exists."`. An empty name throws `"Enter a bank name."`.
  - `createQuestion` on a bank drawn randomly by a PUBLISHED course titled "Fire Safety" throws ``"This bank feeds live training (Fire Safety). Choose another bank or create a new one."``
  - `createQuestion` on a bank drawn only by a DRAFT course calls `reopenDraftCourses` with that course id. It inserts `{ status: "APPROVED", createdBy: "human", authorId: actor.id }`.
  - `createQuestion` by a DEPARTMENT_HEAD actor throws `"Not authorized to manage questions."`.
  - `editQuestion` throws the `editBlockReason` message when it is blocked. When allowed, it updates type, points, body, rubric and version, and reopens the draft courses referencing the question.
- [ ] **Step 3: Run and confirm they fail.**
- [ ] **Step 4: Implement** rules, usage and bank, and extract `reopenDraftCourses`.
- [ ] **Step 5: Run the new tests plus the existing ones that touch questions.** `npx vitest run tests/question-rules.test.ts tests/question-bank-service.test.ts tests/course-approval.test.ts tests/review-fixes.test.ts` should PASS.
- [ ] **Step 6: Commit.** `feat: shared question bank services with live-exam protection`

### Task 4: Question Bank pages

**Files:**
- Create: `lib/questions/actions.ts` (`"use server"`)
- Create: `components/question-bank/bank-page.tsx` (server)
- Create: `components/question-bank/question-editor.tsx` (client, all 7 types)
- Create: `app/(workspace)/{admin,hr,instructor}/questions/page.tsx`
- Create: `app/(workspace)/{admin,hr,instructor}/questions/new/page.tsx`
- Create: `app/(workspace)/{admin,hr,instructor}/questions/[questionId]/edit/page.tsx`
- Test: `tests/question-bank-actions.test.ts`

**Interfaces:**
- Consumes: Task 2 `parseQuestionForm` and `draftToFormDefaults`; Task 3 services and `questionUsage`; Task 1 `questionBankPath`.
- Produces (server actions, all returning `ActionResult` from `components/workspace-form.tsx`):
  ```ts
  createBankAction(form: FormData): Promise<ActionResult>;                 // fields: name, tags (comma separated)
  createQuestionAction(form: FormData): Promise<ActionResult>;             // bankId + Task 2 fields; success → { href: `${questionBankPath(role)}?question=${id}` }
  editQuestionAction(questionId: string, form: FormData): Promise<ActionResult>;
  ```
- Produces: `BankPage({ actor, searchParams })`. Search params: `bank`, `type`, `mine=1`, `q`, `page`, `question`. 25 rows per page.
- Produces: `QuestionEditor({ action, banks, defaults?, defaultBankId? })`. It shows the type select, then the fields for that type, with add and remove rows for options, pairs, order steps and criteria.
- **Page routes:** each page uses `requirePermission("question.author")`, and also checks its workspace matches the role, as with `requireRole`. The `new` page reads `?from=<questionId>` to prefill ("Copy and edit"). The `edit` page shows `editBlockReason` and a "Copy and edit" link instead of the form when editing is blocked.

**Bank page contents:**
- Filters form (GET).
- "New bank" (details plus `WorkspaceForm`) and a "New question" link.
- The list. Each row shows a type label from `questionTypeLabels`, the prompt, points, and an author label: `"You"`, the person's name, `"AI"` for `createdBy === "ai"`, or `"Starter content"`. It also shows where the question is used, as course and quiz titles with a `Used in a live exam` chip when `live && exam`.
- The `?question=` panel: `QuestionGuide`, plus Edit or Copy and edit.

- [ ] **Step 1: Write the failing action tests.**
  - `createQuestionAction` returns `{ error: "Enter the question." }` for an empty prompt.
  - It returns the live-bank error from Task 3.
  - On success it returns an `href` to the bank page with `question=`.
  - `editQuestionAction` returns the block reason as `error`.
  - A DEPARTMENT_HEAD actor is redirected by `requirePermission` (mock it to throw), so no service is called.
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement the actions, pages and components.** Call `revalidatePath` for all three `/questions` roots after writes.
- [ ] **Step 4: Run tests and typecheck.** `npx vitest run tests/question-bank-actions.test.ts && npm run typecheck` should PASS.
- [ ] **Step 5: Check by hand** with `npm run dev`. Sign in as a seeded instructor, open `/instructor/questions`, and add one question of each type. Check that `/department/...` has no Question bank link.
- [ ] **Step 6: Commit.** `feat: Question Bank pages for instructors, HR Head and Admin`

### Task 5: Quiz composition and saving

**Files:**
- Create: `lib/quiz/composition.ts`
- Create: `lib/quiz/composition-actions.ts` (`"use server"`)
- Modify: `app/(workspace)/admin/courses/actions.ts` (`addLessonAction` QUIZ branch uses composition; remove the instructor bank `courseId` restriction)
- Test: `tests/quiz-composition.test.ts`, extend `tests/course-workflow-actions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QuizContent = { picked: string[]; draws: { bankId: string; pickN: number }[] };
  export function toSections(c: QuizContent): QuizSection[];        // [{ fixed: picked }] if any picked, then one { bankId, pickN } per draw
  export function fromSections(s: QuizSection[]): QuizContent;      // concatenates all fixed lists in order; collects draws
  export function parseQuizContent(form: FormData): QuizContent;    // repeated `picked`; paired repeated `drawBank` + `drawCount`; drops blank draw rows
  export async function assertQuizContent(tx: LearningTransaction, c: QuizContent): Promise<void>;
  export type PickerQuestion = { id: string; bankId: string; bankName: string; type: string; prompt: string; points: number; liveExam: boolean };
  // composition-actions.ts
  export async function searchQuestionsAction(filter: { bank?: string; type?: string; q?: string; mine?: boolean; page?: number }): Promise<{ rows: PickerQuestion[]; more: boolean }>;
  export async function createQuestionInlineAction(form: FormData): Promise<{ error?: string; question?: PickerQuestion }>;
  export async function copyQuizContentAction(sourceLessonId: string): Promise<{ error?: string; content?: QuizContent; questions?: PickerQuestion[] }>;
  export async function quizCopySources(actor: Actor): Promise<{ lessonId: string; label: string }[]>; // courses canReadCourse(actor) OR status PUBLISHED; label "Course — Quiz"
  export async function saveQuizAction(courseId: string, lessonId: string, form: FormData): Promise<ActionResult>;
  ```
- **`assertQuizContent` errors:**
  - nothing picked and draws summing to 0: `"Add at least one question."`
  - a duplicate picked id: `"Each question can appear only once."`
  - a picked question not APPROVED or missing: `"One or more picked questions are no longer available. Remove them and save again."`
  - a draw count that isn't a whole number from 1 to 100: `"Random questions must be a whole number from 1 to 100."`
  - an unknown bank: `"Choose a question bank for each random draw."`
- **`saveQuizAction`:**
  - Fields: `title`, Task 5 content fields, `exam`, `integrity`, `confirmLiveExam`, `revision`.
  - Runs `mutateDraftCourse(actor, courseId, run, revision)`. `run` checks the lesson belongs to the course and is QUIZ, then updates `quizzes` (`title`, `sections`, `settings.feedbackMode`, `settings.integrityMode`) and `lessons.title`.
  - If the quiz will be PRACTICE, contains any `liveExamQuestionIds` (picked ones only), and `confirmLiveExam !== "on"`, return `{ error: "Confirm that learners will see answers to questions used in a live exam." }`.
  - Draw counts above a bank's approved count are allowed, because the engine serves what exists. The builder warns (Task 6).
- `addLessonAction` QUIZ uses the same parse, assert and confirm path to build `sections`.

- [ ] **Step 1: Write the failing tests.**
  - `toSections` and `fromSections` round-trip.
  - `fromSections([{ fixed: ["a"] }, { bankId: "b", pickN: 5 }, { fixed: ["c"] }])` returns `{ picked: ["a", "c"], draws: [{ bankId: "b", pickN: 5 }] }`.
  - `parseQuizContent` keeps picked order.
  - Each `assertQuizContent` error, with its exact message.
  - `saveQuizAction` returns the confirm error for a practice quiz that has a live-exam question and no confirmation, and saves when `confirmLiveExam=on`.
  - **Review Focus 1:** with a stale revision, `saveQuizAction` surfaces `"This course changed. Reload before saving."` from `mutateDraftCourse` and writes nothing.
  - `addLessonAction` QUIZ for an INSTRUCTOR with a bank whose `courseId` is another course now succeeds.
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the new and touched tests.** `npx vitest run tests/quiz-composition.test.ts tests/course-workflow-actions.test.ts tests/engine.test.ts` should PASS.
- [ ] **Step 5: Commit.** `feat: compose quizzes from picked, written and random questions`

### Task 6: Quiz builder UI, editor integration and answer key

**Files:**
- Create: `components/quiz-builder.tsx` (client)
- Modify: `app/(workspace)/admin/courses/lesson-form.tsx` (QUIZ fieldset renders `QuizBuilder` in "new" mode)
- Modify: `components/course-editor.tsx`:
  - QUIZ lessons get `<details>` "Edit quiz" with `QuizBuilder` in "edit" mode when `editable`.
  - Load the initial `PickerQuestion` rows for picked ids, and the banks list without the instructor `courseId` filter.
  - Add a `Preview as learner` header action linking to `/preview/course/${id}`, for every viewer of the editor.
- Modify: `components/course-lesson-preview.tsx`, QUIZ branch:
  - Show the pass mark line.
  - Show each picked question with its prompt and `QuestionGuide`.
  - Show each draw as ``"${pickN} random from ${bankName} (${approvedCount} approved questions)"``.
- Test: `tests/quiz-builder.test.ts`. Render with `react-dom/server`, as existing component tests do; check `tests/primitives.test.ts` for the pattern.

**Interfaces:**
- Consumes: Task 5 actions and types; Task 4 `QuestionEditor`.
- Produces: `QuizBuilder({ mode: "new" | "edit", courseId, lessonId?, initial: { title: string; content: QuizContent; questions: PickerQuestion[]; exam: boolean; integrity: boolean }, banks: { id: string; name: string; approvedCount: number }[], copySources: { lessonId: string; label: string }[], revision: number, moduleId? })`.
- **Behavior:**
  - The picked list has up, down and remove controls.
  - The "Add from bank" panel calls `searchQuestionsAction`. Results show the type, prompt and a `Used in a live exam` chip, and "Add" is disabled for questions already picked.
  - "Write a new question" opens `QuestionEditor` in a `components/dialog.tsx` dialog that submits through `createQuestionInlineAction` and appends the result.
  - "Random draw" rows have a bank select and a count, with a warning when count > `approvedCount`: ``"Only ${approvedCount} approved questions in this bank; learners will get ${approvedCount}."``
  - "Copy from another quiz" has a select over `copySources` and calls `copyQuizContentAction`, then merges while skipping duplicates.
  - On submit, if the exam box is off and any picked question is `liveExam`, the builder asks with `window.confirm` using the confirm text from Global Constraints, then sets the hidden `confirmLiveExam=on`.
  - "new" mode posts to `addLessonAction`; "edit" mode posts to `saveQuizAction`. Both go through `WorkspaceForm`.

- [ ] **Step 1: Write the failing render tests.**
  - The edit-mode builder lists the initial picked prompts in order.
  - It shows the `Used in a live exam` chip for a `liveExam` row.
  - It shows the over-draw warning text for a draw with `pickN: 5` against `approvedCount: 3`.
  - `CourseLessonPreview` for a quiz with one picked mcq renders "Correct answer", and renders the draw summary line.
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests and typecheck.** `npx vitest run tests/quiz-builder.test.ts tests/course-curriculum.test.ts && npm run typecheck` should PASS.
- [ ] **Step 5: Check by hand** in dev:
  - As an instructor, add a quiz lesson that mixes picked, inline-written and random questions.
  - Edit it to add two more questions.
  - As the Department Head, open the approval page and see the answer key.
- [ ] **Step 6: Commit.** `feat: quiz builder, quiz editing and reviewer answer key`

### Task 7: Preview data and quiz scoring (no writes)

**Files:**
- Create: `lib/quiz/served.ts` (move the `served` mapping out of `app/api/quiz/[quizId]/start/route.ts`; the route imports it, with no behavior change)
- Modify: `lib/quiz/engine.ts` (export `composeServedItems`)
- Modify: `lib/lms/outline.ts` (add `hrefFor?: (lessonId: string) => string` to `DecorateInput`; the default stays `/lesson/${id}`)
- Create: `lib/preview/course.ts`, `lib/preview/quiz-actions.ts` (`"use server"`)
- Test: `tests/preview.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/quiz/served.ts
  export function toServed(q: typeof t.questions.$inferSelect, s: ServedItem): Served;
  // lib/preview/course.ts
  export type PreviewCourse = { course: typeof t.courses.$inferSelect; view: CourseOutlineView; lessons: (typeof t.lessons.$inferSelect)[]; modules: (typeof t.modules.$inferSelect)[]; prerequisites: { title: string }[]; backHref: string };
  export async function loadPreviewCourse(actor: CurrentUser, courseId: string): Promise<PreviewCourse | null>; // null unless canReadCourse
  export function previewLessonHref(courseId: string, lessonId: string): string; // `/preview/course/${courseId}/lesson/${lessonId}`
  export function learnerLockNote(course: { sequentialLock: boolean }, flatIndex: number): string | null;
  //   → "Learners unlock this lesson after completing the previous one." when sequentialLock && flatIndex > 0
  // lib/preview/quiz-actions.ts
  export type PreviewStart = { servedItems: ServedItem[]; served: Served[]; settings: Pick<QuizSettings, "oneAtATime" | "noBacktrack" | "passPct" | "timeLimitSec" | "feedbackMode" | "integrityMode" | "attemptsLimit" | "cooldownMinutes"> };
  export type PreviewResultItem = { questionId: string; type: string; prompt: string; points: number; earned: number | null; body: QuestionBody; rubric: Rubric | null };
  export type PreviewResult = { earned: number; possible: number; pct: number; passed: boolean; passPct: number; writtenCount: number; items: PreviewResultItem[] };
  export async function startPreviewQuizAction(courseId: string, lessonId: string): Promise<{ error?: string; start?: PreviewStart }>;
  export async function submitPreviewQuizAction(courseId: string, lessonId: string, servedItems: ServedItem[], answers: Record<string, Answer>): Promise<{ error?: string; result?: PreviewResult }>;
  export function previewScore(items: { q: QuestionForScoring & { id: string }; served: ServedItem; answer: Answer | undefined }[], passPct: number): Omit<PreviewResult, "items" | "passPct"> & { earnedById: Map<string, number | null> };
  ```
- **Access:** both actions `requireUser()`, then load the course, `canReadCourse(actor, course)`, check the lesson is a QUIZ in that course, and load the quiz. Learners therefore always fail with `{ error: "Preview is not available." }`.
- **`startPreviewQuizAction`** returns `{ error: "This quiz has no questions yet." }` when `composeServedItems(quiz)` returns `[]`.
- **`submitPreviewQuizAction`** rejects (Review Focus 3) when any `servedItems[i].questionId` is neither in the quiz's picked ids nor an APPROVED question in one of its draw banks, returning `{ error: "This preview no longer matches the quiz. Start again." }`.
- **Scoring:** `scoreQuestion(q, unmapAnswer(q, served, answer))` for non-free-text questions. Free-text questions get `earned: null` and are excluded from `possible`. `pct` uses the `scoreQuiz` rounding (one decimal), and `passed = pct >= passPct`.

- [ ] **Step 1: Write the failing tests.** Mock `db` with `insert`, `update` and `delete` that throw `"write in preview"`.
  - `previewScore` gives full points for an mcq answered in displayed order `[2]` with `choiceOrder [1, 2, 0]` when the true correct is `[0]` (Review Focus 4).
  - `previewScore` excludes free text: one mcq worth 1 that is right plus one free text gives `possible 1, pct 100, writtenCount 1`.
  - `submitPreviewQuizAction` returns the mismatch error for a foreign question id.
  - Both actions return `"Preview is not available."` for a LEARNER actor.
  - **Review Focus 2:** `startPreviewQuizAction` with a draw of 5 from a bank holding 3 approved questions serves 3.
  - `decorateOutline` with `hrefFor` uses it for every lesson href, and without it keeps `/lesson/…` (extend `tests/outline.test.ts`).
  - Confirm that no test path calls `insert`, `update` or `delete`.
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.** Move `toServed` out of the start route, and re-run `tests/engine.test.ts` and `tests/assessment-state.test.ts`.
- [ ] **Step 4: Run the tests.** `npx vitest run tests/preview.test.ts tests/outline.test.ts tests/engine.test.ts tests/assessment-state.test.ts` should PASS.
- [ ] **Step 5: Commit.** `feat: preview course data and non-persisting quiz scoring`

### Task 8: Preview pages

**Files:**
- Create: `app/(preview)/layout.tsx`. It runs `requireUser()` and redirects LEARNER to `/home`. It renders a learner-styled frame (same container widths as `LearnerShell` content, no learner nav).
- Create: `components/preview-banner.tsx`, `PreviewBanner({ backHref }: { backHref: string })`. A sticky bar reading `Preview — nothing is saved`, with a `Back to editor` link. Every preview page renders it first, with `backHref` from `loadPreviewCourse`.
- Create: `app/(preview)/preview/course/[courseId]/page.tsx`. It shows the course overview: cover, title, description, and these notes:
  - when `startsAt` is in the future: ``Opens for learners on ${formatted date}``
  - when there are prerequisites: ``Learners must first complete: ${titles}``
  - when `sequentialLock`: `Learners complete lessons in order.`
  It renders `CourseOutline` with the preview view. A course with no lessons shows `This course has no lessons yet.` (Review Focus 5).
- Create: `app/(preview)/preview/course/[courseId]/lesson/[lessonId]/page.tsx`. It mirrors the learner lesson page structure (breadcrumb, "Lesson n of N", contents rail via `CourseOutline variant="rail"`, previous and next), and shows `learnerLockNote` when it applies. By type:
  - TEXT and PDF: the same markup as the learner page.
  - VIDEO: `components/preview-video.tsx`, an iframe `https://www.youtube-nocookie.com/embed/${youtubeId}` with a title, or the same not-ready messages as `VideoLesson`.
  - INTERVIEW: the scope, question-count and pass-mark sentence from `InterviewLesson`, plus a disabled `Start oral check` button and the note `Voice oral checks don't run in preview.`
  - QUIZ: the intro card with `quizIntroFigures(settings, 1, 0)` and an `Open assessment` link to the preview quiz page.
  No `LessonProgressProvider`, `LessonCompletion`, tutor or `VideoLessonClient`.
- Create: `app/(preview)/preview/course/[courseId]/quiz/[lessonId]/page.tsx` and `components/preview-quiz-runner.tsx` (client).
  - The runner shows these information lines:
    - ``Learners get ${attemptsLimit ?? "unlimited"} attempts``
    - `Integrity monitoring is on for learners; it doesn't run in preview.` when on
    - `In exam mode, learners see answers only after the window closes.` when EXAM
  - "Start" calls `startPreviewQuizAction` and renders `QuestionInput` (or one at a time with no back button when `noBacktrack`).
  - A time limit shows as a countdown. At zero, show `Time's up. Learners' answers are submitted automatically at this point.` and submit.
  - "Submit" calls `submitPreviewQuizAction`. The result shows the score, `Passed` or `Not passed` against the pass mark, and per question the earned/points with `QuestionGuide`. Free-text answers show `Written answers are graded by AI and reviewed by people for learners. Not scored in preview.`
  - "Try again" draws fresh.
- Test: `tests/preview-pages.test.ts`. Render-level: the banner text is present, the lock note shows on lesson 2 of a sequential course, and the interview start button is disabled.

**Interfaces:**
- Consumes: Task 7 everything; Task 6 the editor button target `/preview/course/${id}`.
- Every page calls `loadPreviewCourse(await requireUser(), courseId)` and `notFound()` on null. A lessonId that isn't in the course also returns `notFound()`.

- [ ] **Step 1: Write the failing render tests.**
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement** the layout, pages and components.
- [ ] **Step 4: Run tests, typecheck and build.** `npx vitest run tests/preview-pages.test.ts && npm run typecheck && npm run build` should PASS.
- [ ] **Step 5: Check by hand** in dev. Preview a draft course as the instructor, walk through every lesson type and take its quiz. Then check in `psql` that the `attempts`, `lesson_progress`, `enrollments` and `points_ledger` row counts haven't changed (find the exact table names in `lib/db/schema.ts`).
- [ ] **Step 6: Commit.** `feat: learner preview for course authors and approvers`

### Task 9: End-to-end tests, docs and full verification

**Files:**
- Create: `e2e/question-bank-preview.e2e.ts` (no `@core` tag; it runs in chromium-desktop and chromium-mobile)
- Modify: `docs/qa/CLIENT_DELIVERY_DECISIONS.md` (new section "Question Bank, quiz builder and preview — 8 November 2026", in the existing style, listing TJ's decisions and Claude's calls from the spec)
- Modify: `README.md` (one line under Assessment engine: shared Question Bank, quiz builder and learner preview)

**E2E scenarios.** Create people with `createPerson`, and seed only prerequisites through `withDb`. All qualified operations go through the UI.

1. **Instructor builds content.**
   - The instructor sees `Question bank` in the nav, creates bank "QA Bank <uuid>", and adds one question of each of the 7 types.
   - Their course gets a quiz lesson with 2 picked questions, 1 written inline and a random draw of 2 from the new bank.
   - They edit the quiz to add one more picked question, and the curriculum shows 4 picked questions.
2. **Instructor previews and takes the quiz.**
   - Assert the banner text and that every lesson opens.
   - They complete the quiz and see a score.
   - `withDb` row counts for that instructor in `attempts`, `lesson_progress`, `enrollments` and the points table are the same before and after.
3. **Access is enforced.**
   - A learner gets 404 or a redirect on `/preview/course/<id>` and `/instructor/questions`.
   - The Department Head of the course's department can open the preview, and sees the answer key on the approval page.
4. **Edit and live-bank rules.**
   - Instructor B opens instructor A's question edit URL and sees `Only the author, HR Head or Admin can edit this question.`
   - After a course that randomly draws from bank X is published (set up through `withDb`, as `client-approval.e2e.ts` does), adding a question to X shows the live-bank error.
5. **Mobile width (Review Focus 5).** On chromium-mobile, `expectNoPageOverflow` passes on the bank page, the builder and the preview lesson page with a 300-character unbroken prompt.

- [ ] **Step 1: Write the e2e file.**
- [ ] **Step 2: Apply the migration to the e2e database** (`welearn_*`, from `.env`) through `npm run start:deploy` or `psql -f migrations/20261108_question_authors.sql`.
- [ ] **Step 3: Run it.** `npm run test:e2e -- e2e/question-bank-preview.e2e.ts --project=chromium-desktop --project=chromium-mobile` should PASS.
- [ ] **Step 4: Full regression.**
  - `npm test && npm run typecheck && npm run build` should all pass.
  - Then run the full matrix in the background (`npm run test:e2e`, about 35 minutes) with no failures.
  - If existing e2e files break only because the quiz lesson form changed (bank select plus "Questions to draw" replaced by the builder), update those tests to drive the builder. Don't weaken their assertions.
- [ ] **Step 5: Update the docs and commit.** `test: question bank, quiz builder and preview e2e; docs`
