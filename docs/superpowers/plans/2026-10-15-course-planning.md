# Course Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved course scheduling, prerequisite, nested-folder and Upcoming workflows while keeping the local preview running.

**Architecture:** Add nullable planning metadata and a separate prerequisite graph, then connect pure validation and database access decisions to existing approval and learner boundaries. Preserve the existing course editor/catalog world and immutable learning histories. Use direct execution as the user previously selected and explicitly requested to continue.

**Tech Stack:** Existing Next.js 15, React 19, TypeScript, Tailwind, Drizzle, PostgreSQL 16, Vitest and Playwright; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-15-course-planning-design.md`

## Global Constraints

- Course calendar dates use `Asia/Dubai`; starts open at local midnight, ends include 23:59:59 local.
- End dates are completion targets; overdue learning stays available.
- Existing undated courses, enrollments, due dates, completion/certificate/feedback history survive unchanged.
- Published future training can be assigned; new deadlines must not precede opening.
- Explicit prerequisites and existing ordered-path/lesson rules all apply.
- Planning edits use current author ownership, draft state, revision checks and renewed approval.
- Folders are normalized organizational paths, never access grants or filesystem paths.
- Preserve xprtn Operate UI, dark mode, native controls, keyboard support and 44px targets.
- No new dependency, production deployment, CI bypass, external email or HRMS connection.

## Review Focus

1. A quiz/oral session opened before a schedule/prerequisite edit must not award learning credit after the new gate blocks it. Task 2 tests final-credit and existing-session requests.
2. Concurrent A→B and B→A author edits must not create a cyclic dependency. Task 2 tests real competing transactions.
3. A historical prerequisite completion remains valid after renewal clears lesson progress; old feedback/certificates remain readable while a new cycle is gated. Tasks 2 and 3 test both views and records.
4. A future course in a multi-course rule/path/renewal with a conflicting due date must not create a partial assignment or reset progress. Task 2 tests all target rows and preserved bytes.
5. Folder names containing Unicode, URL punctuation or sibling prefixes must preserve scope, navigation and counts without exposing unpublished titles. Tasks 1 and 3 test normalization, segment matching and browser Back.

### Task 1: Additive planning storage and pure policies

**Files:** Create `lib/courses/planning.ts`, `migrations/20261015_course_planning.sql`, `tests/course-planning.test.ts`; modify `lib/db/schema.ts`, `scripts/deploy-init.ts`, `scripts/qa-client-migration.ts`, `migrations/README.md`.

**Interfaces:** Produce `parseCoursePlanning(input: {startDate:string;endDate:string;folderPath:string;prerequisiteIds:string[]}): {startsAt:Date|null;endsAt:Date|null;folderPath:string;prerequisiteIds:string[]}`, `normalizeFolderPath(value:string):string`, `assertAcyclicPrerequisites(courseId:string,requiredIds:string[],edges:{courseId:string;requiredCourseId:string}[]):void`, `courseHasOpened(startsAt:Date|null|undefined,now?:Date):boolean`, `enrollmentDeadline(course:{startsAt:Date|null;endsAt:Date|null},explicit:Date|null):Date|null` and `folderChildren(courses:{folderPath:string}[],parent:string):{name:string;path:string;count:number}[]`.

- [ ] **Step 1 Write pure RED cases.** These tests catch permissive/mis-timed calendar parsing, traversal-like folders, prefix leakage and missed graph cycles.

```ts
expect(parseCoursePlanning({startDate:"2026-10-20",endDate:"2026-10-21",folderPath:" Operations / Safety ",prerequisiteIds:[]})).toMatchObject({startsAt:new Date("2026-10-19T20:00:00Z"),endsAt:new Date("2026-10-21T19:59:59Z"),folderPath:"Operations/Safety"});
expect(()=>parseCoursePlanning({startDate:"2026-02-30",endDate:"",folderPath:"",prerequisiteIds:[]})).toThrow();
expect(()=>normalizeFolderPath("Safety/../Private")).toThrow();
expect(()=>assertAcyclicPrerequisites("a",["b"],[{courseId:"b",requiredCourseId:"a"}])).toThrow();
expect(folderChildren([{folderPath:"Safety/Food"},{folderPath:"Safetyware/Tools"}],"Safety")).toEqual([{name:"Food",path:"Safety/Food",count:1}]);
```

- [ ] **Step 2 Run** `npm test -- tests/course-planning.test.ts`. Expected: missing exports/module RED. Add cases for blank dates, exact opening boundary, inclusive month/year ends, reversed dates, explicit deadline precedence, due-before-open rejection, Unicode, empty interior segments, duplicate IDs and indirect/non-root cycles.
- [ ] **Step 3 Implement policies and additive schema.** Add `startsAt`/`endsAt` nullable timezone timestamps, `folderPath` text default empty to courses. Add `coursePrerequisites` pair/foreign-key/self checks. Implement policies using `zonedTimeToUtc`, real calendar round-trip validation and graph traversal; leave existing data unset.
- [ ] **Step 4 Run** targeted tests then `npm test` and `npm run typecheck`. Expected: all pass. Extend the real migration probe to apply new migration twice and compare all pre-existing columns of the role/feedback baseline, not hashes that include new columns. Expected: unchanged bytes/counts, empty default graph and valid range constraints.
- [ ] **Step 5 Commit** `feat: add course planning storage and validation`; run task-done with `npm test`.

### Task 2: Approval-bound authoring and server learning gates

**Files:** Create `lib/courses/planning-service.ts`, `lib/lms/planning-access.ts`, `lib/courses/locks.ts`, `scripts/qa-course-planning.ts`; modify `lib/courses/workflow.ts`, `app/(workspace)/admin/courses/actions.ts`, `lib/lms/learning-cycle.ts`, `lib/lms/lesson-access.ts`, `lib/lms/completion.ts`, `lib/lms/rules.ts`, `lib/courses/rollout.ts`, affected quiz/oral/progress entry files. Test `tests/course-planning-access.test.ts` and the real QA probe.

**Interfaces:** Consume Task 1 policies and `LearningDatabase`/`LearningTransaction`. Produce `saveCoursePlanning(tx,courseId,input):Promise<void>` for callers already inside `mutateDraftCourse`; `coursePlanningAccess(userId,courseId,connection=db,now=new Date()):Promise<{blocked:false}|{blocked:true;reason:"scheduled"|"prerequisite"|"unavailable";message:string;startsAt?:Date;requiredCourses?:{id:string;title:string;available:boolean}[]}>`; `assertCoursePlanningAccess(userId,courseId,connection):Promise<void>`. Shared/exclusive curriculum-lock exports preserve old workflow imports.

- [ ] **Step 1 Write service/DB RED cases.** Build two text courses and people with the existing real fixtures. Before mutation, retain enrollment/progress/completion/certificate/feedback bytes. A scheduled target must block direct lesson/progress/assessment/oral access and completion before opening; after prerequisite completion it must still wait for its start. The QA probe asserts stored counts as well as returned status.

```ts
await assert.rejects(assertCoursePlanningAccess(employee.id,target.id,db),/opens|prerequisite/i);
assert.equal((await coursePlanningAccess(employee.id,target.id,db,new Date("2026-10-19T20:00:00Z"))).blocked,false);
const edits=await Promise.allSettled([editDependencies(a,[b]),editDependencies(b,[a])]);
assert.equal(edits.filter(r=>r.status==="fulfilled").length,1);
```

- [ ] **Step 2 Run** targeted Vitest and `node .artifacts/client-requirements-20261014/run.cjs npx tsx scripts/qa-course-planning.ts`. Expected: missing planning service or unblocked access RED. Distinguish fixture setup from real approval/assignment/completion actions.
- [ ] **Step 3 Implement transactional updates/access.** Save graph and dates inside existing author/revision/global curriculum lock. Only newly chosen prerequisites require available publication; preserved archived dependencies stay reviewable. Revalidate graph at submit/publication. Add shared curriculum lock before per-user course locks, with consistent ordering, and recheck planning before learning credit. Extend shared lesson and quiz access to supplied connections; check existing quiz/oral requests without locking provider latency. Return actionable errors rather than fabricated completion.
- [ ] **Step 4 Implement new-enrollment deadline behavior.** Explicit deadline overrides course target. Reject manual due-before-open, keep automatic conflicting targets pending as a whole, and preserve renewal state until eligible. Existing enrollments are never rewritten. Assert immutable completion records satisfy prerequisites even after renewal; no fresh-history backfill.
- [ ] **Step 5 Run** targeted DB races, full suite, type check and production build sequentially. Expected: direct routes cannot award credit, concurrent edits leave an acyclic graph, no partial path/reset and preserved history. Commit `feat: enforce scheduled and prerequisite course access`; task-done `npm test`.

### Task 3: Author controls, Upcoming learning and nested folders

**Files:** Modify `components/course-editor.tsx`, `components/course-card.tsx`, `components/catalog-filters.tsx`, `lib/lms/catalog.ts`, `lib/lms/queries.ts`, `app/(learner)/learn/page.tsx`, `app/(learner)/course/[courseId]/page.tsx`, Home's recommendation consumer and lesson/quiz blocked copy. Create focused planning/folder UI components where they avoid growing existing files. Add `e2e/course-planning.e2e.ts` and catalog unit cases.

**Interfaces:** Task 2 access result supplies truthful opening/prerequisite states. Extend `CatalogQuery.view` with `upcoming` and `folder:string`; preserve old parser/filter callers with optional planning fields. Dates render in `Asia/Dubai`. No new source of learner identity or course access grants.

- [ ] **Step 1 Write browser RED.** Instructor fills start/end/folder/prerequisite fields; Department Head sees them during review; HR publishes and assigns future training; Employee sees Upcoming, actual enrollment date and locked prerequisites. Test invalid settings retains inputs, native navigation/Back, nested folder siblings, dark/mobile/keyboard and no false Start action. Expected: missing fields/view/blocked explanation RED.

```ts
await page.getByLabel("Course start date",{exact:true}).fill("2031-10-20");
await page.getByLabel("Course end date",{exact:true}).fill("2031-10-22");
await page.getByLabel("Course folder",{exact:true}).fill("Operations/Safety");
await employeePage.goto("/learn?view=upcoming");
await expect(employeePage.getByText(targetTitle,{exact:true})).toBeVisible();
await expect(employeePage.getByRole("button",{name:"Start course",exact:true})).toHaveCount(0);
```

- [ ] **Step 2 Run** `npm run test:e2e -- e2e/course-planning.e2e.ts --project=chromium-desktop --workers=1` against the provider-free test runtime. Expected: missing planning controls/view RED.
- [ ] **Step 3 Build established-world UI.** Add date/target hints, multi-prerequisite choices, folder path guidance and pending/error feedback using current components. Catalog shows child-folder links/breadcrumbs with counts and URL state. Upcoming includes assigned incomplete future courses sorted by start; Home avoids presenting future lessons as ready. Course detail keeps enrollment/deadline and historic evidence visible alongside blocked context.
- [ ] **Step 4 Verify** actual opening by advancing fixture dates through the real draft→approve→publish path or controlled server clock input in service tests; no browser-clock substitute. Complete prerequisite then target and prove certificate/feedback history plus overdue completion. Run existing path/renewal/catalog/feedback regressions and full suite/type/build. Expected: all pass across desktop/mobile Chromium, Firefox/WebKit; no page overflow or serious accessibility violations. Commit `feat: show upcoming courses and nested learning folders`; task-done `npm test`.

### Task 4: Review, main integration and refreshed preview

**Files:** Update qualification/demo/migration documentation and preserve plan execution evidence.

- [ ] **Step 1 Qualify** full real-backend author→Department Head→HR→Employee flows for schedule opening, prerequisites, nested folders, enrollment dates, overdue completion and historical feedback/certificates. Run `npm test`, type check/build sequentially, migration preservation, DB races and four-profile browser cases; retain failed runs and label fixture setup honestly.
- [ ] **Step 2 Fresh reviews.** Obtain one most-capable fresh whole-range code review using the Review Focus and ledger, plus the skill-required visual finish reviewer. Grade by user effect. One correction pass for Critical/Important findings, each RED→GREEN and whole-suite GREEN; ledger minors and declined-to-judge rulings. No second reviewer/detector pass.
- [ ] **Step 3 Integrate** after checking main/remote for Claude audit changes. Preserve those edits, verify the combined tree and push main/feature under existing authorization. Do not deploy Railway or bypass CI.
- [ ] **Step 4 Refresh clean preview** additively without reseeding and run actual role sign-in/learning smoke. Verify URL health and runtime build. Update demo and delivery-register boundaries; preserve ignored DB/evidence and archive only this completed plan's scratch record. Commit qualification, task-done `npm test`.
