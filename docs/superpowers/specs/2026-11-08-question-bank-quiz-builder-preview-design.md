# Question Bank, quiz builder and instructor preview

Date: 8 November 2026. Status: design for TJ's approval (not built).

## Why

Client feedback (pasted by TJ, 8 Nov 2026):

- Instructors cannot find any way to reach the Question Bank.
- They want to reuse existing questions, add their own, and build quizzes from them without re-typing questions. "I should be able to add more questions to the quiz."
- They want to preview a course at any stage and see exactly what a learner sees, including quizzes and navigation.

## What exists today (checked in code)

- **No Question Bank screen exists for any role.** Questions come only from `scripts/seed-assessments.ts` and AI drafts (`lib/quiz/generate.ts`). Admin and HR Head approve AI drafts in `/admin/reviews` (permission `assessment.review`).
- **Quiz lessons are created in one way.** `LessonForm` (`app/(workspace)/admin/courses/lesson-form.tsx`) offers one bank plus "Questions to draw" (random N). `addLessonAction` stores `sections: [{ bankId, pickN }]`. Instructors only see banks with no `courseId` or with their own course's `courseId`. A quiz cannot be edited after it is created.
- **The schema already supports picked questions.** `QuizSection = { fixed?: string[]; bankId?: string; pickN?: number }`. `composeServedItems` in `lib/quiz/engine.ts` serves `fixed` ids as listed, whatever their status, and draws only APPROVED questions from a bank. The seeded quizzes use `fixed`.
- **Attempts store only question ids and order.** They don't keep a copy of the question text. Editing a question therefore changes how past attempts read in review.
- **Bank changes are already protected.** `lib/courses/questions.ts#updateDraftQuestion` changes a question only when every affected course is an unsubmitted draft. Affected means the course uses the question in a `fixed` list, draws randomly from its bank, or owns the bank. It bumps each affected course's `contentRevision`, resets approval to DRAFT, and refuses if any affected course is published, submitted or approved.
- **There's no full learner view of an unpublished course.** Learner pages (`app/(learner)/course|lesson|quiz`) require PUBLISHED plus planning access and write progress. The course editor only has per-lesson "Review lesson content" (`components/course-lesson-preview.tsx`). "View learner course" appears only once a course is published.
- **Roles.** `lib/auth/permissions.ts`: INSTRUCTOR has `course.author`, `reports.read`, `feedback.read`. Course read rules live in `lib/courses/ownership.ts` (`canReadCourse`, `canAuthorCourse`).

## Decisions TJ made

1. **One shared Question Bank.** Instructors add questions directly into the central bank. There are no private pools.
2. **Instructors can write all 7 question types:** single choice, multiple choice, true/false, fill in the blank, matching, ordering, written answer (free text with rubric).
3. **Quizzes stay inside their course.** Reuse happens at the question level. There's no separate quiz library.
4. **Preview lets you take quizzes for real.** You answer, submit, and see your score and the correct answers. Nothing is saved.
5. **Trust authors with answers.** Everyone with bank access sees every question's answers, including questions used in live exams. Adding a live-exam question to a practice quiz shows a warning but is allowed.

## Proposed by Claude, shown to TJ, not objected to

- Instructor-written questions can be used right away, with no separate review step. The Department Head's course approval covers them. AI-drafted questions keep the existing review step.
- Editing is limited so a live exam never changes by accident (rules below). Otherwise the author uses "Copy and edit".
- HR Head and Admin also get the Question Bank page.
- The quiz builder mixes three sources: picked from the bank, written inline (saved to the bank automatically), and random draw from a bank. Existing quizzes get "Edit questions" to add, remove and reorder.
- "Copy questions from another quiz" gives a fast start.
- The bank shows where each question is used.
- Changing a quiz in a published course still needs "Revise course" first.
- Preview: a "Preview as learner" button at any stage, a "Preview — nothing is saved" banner with "Back to editor", and nothing recorded. You can open any lesson, and locked lessons show a note instead of blocking. A voice oral check shows only its start screen. Instructors, HR Head, Admin and the course's Department Head can preview.
- Written answers in preview show the model answer instead of AI grading.

## Goals

- Instructors, HR Head and Admin can view the shared bank, add banks and questions of all 7 types, and find and reuse existing questions.
- Authors can build a new quiz, or edit an existing one, from picked questions, newly written questions and random-draw rules, and can copy questions from another quiz.
- Every question added to a quiz lives in the bank and can be reused. Quizzes reference questions and never copy them.
- Anyone who can open a course in a workspace can preview it as a learner at any stage, including taking its quizzes. The preview writes nothing.

## Non-goals

- A reusable quiz library across courses.
- CSV import of questions (FR-6.2 mentions it; not requested now).
- Deleting or retiring questions from the bank page.
- New quiz settings. Pass mark, attempts, time limit and windows keep their current defaults. Only the existing "Exam mode" and "Integrity monitoring" toggles and the lesson title appear in the builder.
- Changing how AI drafts are generated or reviewed.
- Department Head access to the Question Bank page.
- Running the live AI voice oral check or the AI tutor inside preview.

## Anti-goals (failure even if it "works")

- A published course, or one that is submitted or approved, changes what its learners are asked in graded quizzes and exams without going through "Revise course" and approval again. The optional daily drill is out of this rule. It already draws from whole banks and ignores course status (`lib/quiz/drill.ts`), it never counts toward training status, and it stays unchanged. (Claude's call, from the builder check.)
- Preview creates or changes any learner record: enrollment, lesson progress, video buckets, attempts, answers, points, badges, activity days or streaks, certificates, notifications, drill state, reports or audit noise counted as learning.
- An unapproved AI draft becomes pickable or appears in a quiz.
- A learner, or a workspace user who can't read the course, reaches draft content through a preview URL.
- An instructor edits another instructor's question, or silently changes the history of past attempts.

## Part 1: Access

- Add a permission (suggested name `question.author`) granted to ADMIN, HR_HEAD and INSTRUCTOR. Every bank and question server action checks it on the server. Hiding a nav item is not enough.
- Add a "Question bank" nav item to the instructor, HR and admin workspaces (`lib/navigation.ts`). The route layout is the builder's call. The current pattern is one shared component mounted per workspace, like `CourseEditor`. Instructors cannot use `/admin/*` routes.

## Part 2: The Question Bank page

**Browse**
- Lists every bank, and every APPROVED question across all banks, whatever the bank's `courseId`. Instructors are no longer limited to unlinked banks or banks tied to their own course.
- Filters: bank, question type, "My questions" (author is me), and text search over prompt and scenario. Use pagination or a limit so a large bank stays usable (builder's call).
- Each row shows type, prompt, points, author ("You", the person's name, "AI" or "Starter content"), and **where used**: the course and quiz names whose `fixed` lists include it, plus courses drawing randomly from its bank.
- Opening a question shows it in full with correct answers, explanation and rubric. Reuse `app/(workspace)/admin/reviews/question-guide.tsx`.
- DRAFT and RETIRED questions don't appear. Showing a count of AI drafts awaiting review, with a link for roles that hold `assessment.review`, is optional.

**Add a bank**
- Name is required and trimmed, and must be unique ignoring case. Tags are optional. Any role with the permission can add one. `courseId` stays null.

**Add a question**
- Choose a bank, then fill a form for the chosen type. Validation per type:
  - Single choice: 2+ options, exactly 1 correct. Optional "keep in place" options (`lockedOptionIndices`, for example "All of the above").
  - Multiple choice: 2+ options, 1+ correct.
  - True/false: one correct value, stored as the engine expects (`correct: [0]` means true, `[1]` means false).
  - Fill in the blank: 1+ accepted answers.
  - Matching: 2+ pairs, each with both sides filled.
  - Ordering: 2+ items, entered in the correct order.
  - Written answer: rubric with 1+ criteria (name and points) and a model answer.
  - All types: prompt required. Scenario (`stimulus`) and explanation optional. Points default to 1, minimum 1.
- Store with `status: "APPROVED"`, `createdBy: "human"`, and a new `author_id` set to the actor. Seed and AI rows keep `author_id` null.
- **Adding to a bank changes its random draws.** If any published, submitted or approved course draws randomly from this bank, refuse with a clear message that names those courses and suggests another bank or a new one. Draft courses drawing randomly from the bank get the usual revision bump and approval reset. Only random-draw sections count here. A bank's `courseId` and courses that merely pick questions from the bank (`fixed`) do not block it, because a new question is in no fixed list. The seeded banks feed only fixed-list quizzes, so they stay open for new questions. (Claude's call; flagged for TJ below.)

**Edit a question**
- Allowed only when all of these hold:
  - The actor is its author, or is HR Head or Admin.
  - It has never been served in any attempt (`attempts.served_items`).
  - No published, submitted or approved course references it, through a fixed list or a random draw from its bank.
- Draft courses that reference it get the revision bump and approval reset, using the same lock order as `updateDraftQuestion`.
- Otherwise the page offers **Copy and edit**. This makes a new question in the same bank with the actor as author, and leaves the original untouched.

## Part 3: The quiz builder

- **Where it appears:** when adding a "Quiz or exam" lesson, and as "Edit quiz" on existing quiz lessons in the curriculum view. Only when the course is editable (the same `editable` rule as `CourseEditor`).
- **A quiz's content** is an ordered list of picked questions plus zero or more random-draw rules (bank and count). Store picked questions as one `{ fixed: [...] }` section first, then one `{ bankId, pickN }` section per rule. This keeps the attempt engine and drill eligibility (`lib/quiz/drill.ts`) working unchanged.
- **Ways to add questions:**
  1. Pick from the bank: the same search and filters as Part 2, APPROVED only, tick to add. Questions already in the quiz are marked.
  2. Write a new question inline: the same form and rules as Part 2. It's saved to the chosen bank and added to this quiz.
  3. Add a random-draw rule: a bank plus a count. Warn when the count is more than the bank's APPROVED questions.
  4. Copy questions from another quiz: choose a quiz from any course the actor can read, or any published course. Its APPROVED picked questions and its random-draw rules are added; duplicates are skipped.
- Picked questions can be reordered and removed.
- **Live-exam warning (TJ's decision 5).** In the picker, questions that a published, submitted or approved course uses in an exam-mode quiz (`feedbackMode: "EXAM"`, via a fixed list or a random draw from their bank) carry a "Used in a live exam" badge. Saving a practice-mode quiz that contains any such question asks for confirmation: "Learners will see these answers right after submitting". The save still goes ahead if the author confirms. Nothing is hidden from authors.
- **Save validation:** at least one question in total (picked count plus sum of draw counts > 0), no duplicate picked ids, every picked id APPROVED, and every bank exists. Save through `mutateDraftCourse` with the hidden `revision` field, like other curriculum edits (revision bump, approval reset, stale-form error).
- Existing quizzes (bank and count only, or seeded `fixed`) open in the builder showing their current content, and keep working if never edited.
- The bank restriction in `addLessonAction` for instructors (bank `courseId` must match) is removed, consistent with one shared bank.
- **Answer key for reviewers.** The Department Head's approval is the only check on instructor-written questions, so the curriculum view's quiz lesson review (`components/course-lesson-preview.tsx`, which approvers see through `CourseEditor`) lists every question the quiz can serve. That means each picked question plus a summary of each random-draw rule ("5 random from Fire Safety, 23 approved questions"), and each picked question shows its full answer key through `question-guide.tsx`. (Claude's call, from the builder check.)

## Part 4: Preview as learner

- **The button.** "Preview as learner" in the course editor header (`components/course-editor.tsx`), shown to anyone for whom `canReadCourse` is true, whatever the course status. Every preview page re-checks `canReadCourse` on the server. Learners and anyone else get 404.
- **What it shows.** The course as it is stored now, meaning the current draft. It mirrors the learner course overview, lesson pages and quiz pages, reusing their components where practical, so preview stays faithful as those pages change.
- **Banner.** "Preview — nothing is saved" and "Back to editor" (to `courseWorkspacePath`) stay visible on every preview page. The surrounding navigation is the builder's call, as long as the preview never sends the viewer into real learner pages for this course without saying so.
- **Navigation.** Every lesson can be opened, with next and previous buttons. Rules that would block a learner (sequential lock, prerequisites, start dates) appear as notes such as "Locked for learners until the previous lesson is complete", not as blocks.
- **Lessons.** Text and PDF render as for learners. Video plays with no progress heartbeats. Completion controls are disabled or replaced by "Next lesson". The AI tutor is hidden. A voice oral check shows its intro screen and settings; start is disabled with a note.
- **Quizzes, taken for real:**
  - "Start" draws questions exactly as a real attempt would, following random draws and the shuffle, one-at-a-time and no-backtrack settings. Each start draws fresh. Reuse `composeServedItems` without inserting an attempt.
  - Show the time limit. Whether the timer counts down or auto-submits is the builder's call.
  - Submit scores on the server with the existing `scoreQuestion` and `scoreQuiz` logic and persists nothing. The result shows the score, pass or fail against the quiz's pass mark, and correct answers and explanations for every question. Exam-mode sealing is ignored for authors; a note says learners in exam mode see answers only after the window.
  - Written answers aren't AI-graded. They show the rubric and model answer, are left out of the score, and a note says so.
  - Attempts limit, cooldown, availability window and integrity monitoring aren't enforced or started. They appear as information ("Learners get 3 attempts…").
- **No writes.** Preview routes and actions must never insert or update any of the records listed under Anti-goals. Tests prove this.

## Data changes

- Add `questions.author_id` (nullable, references users) through a new SQL migration in `migrations/`, following the existing naming, plus the Drizzle schema change.
- Bank name uniqueness ignoring case: the builder chooses an index or an application check.
- No change to `quizzes`, `attempts` or the attempt engine contract, apart from exporting what preview needs (for example `composeServedItems`).

## Tests

- **Unit:** the permission grants; per-type question validation for all 7 types; the add and edit refusal rules (live bank draws, served-in-attempt, not the author); building quiz sections (picked, rules, copy with dedupe); preview scoring returning results without writing.
- **E2E:**
  - An instructor sees "Question bank", creates a bank, and adds one question of each type.
  - They build a quiz from picked, inline-written and random questions, and add more questions to an existing quiz.
  - They preview the course and complete a quiz, then the test asserts that no attempt, progress, points or enrollment rows were written.
  - A learner gets 404 on preview URLs.
  - A Department Head can preview a course in their department.
  - An instructor can't edit another instructor's question, and can't add to a bank feeding a live exam.
- **Regression:** existing unit tests, typecheck, build and the full e2e matrix still pass. Several existing e2e files touch course editing and quizzes.

## Left to the builder

Route names and layout, component split, page layout and styling (follow `DESIGN.md` and the existing workspace UI), pagination and search implementation, the migration file name, and how the preview quiz runner shares code with `app/(learner)/quiz/[quizId]/runner.tsx`. Recording the change for the client in `docs/qa/CLIENT_DELIVERY_DECISIONS.md` is expected, in the existing style.

## Claude's calls not yet discussed with TJ

- Blocking new questions in banks that feed a live random-draw exam (Part 2).
- HR Head and Admin can edit any eligible question; instructors only their own.
- "Copy questions from another quiz" draws on any course the actor can read, plus any published course.
- The AI tutor is hidden in preview.
- The approval and review screens show every quiz question's full answer key (Part 3).
- The daily drill is left unchanged, and the "live exams never change" rule covers graded quizzes and exams only.
