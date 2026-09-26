# welearn UI/UX rework and browser qualification

Approved in chat on 2026-09-26. This file preserves the implementation contract, including the user's correction that the product name is lowercase **welearn**. The earlier MVP specification remains authority for domain rules, but this plan supersedes its visual design. Do not reduce scope to what existing tests happen to cover.

## Global Constraints

Rework all learner, manager, admin, authentication and supporting workflows into a white/blue professional learning experience inspired by Coursera discovery/course pages and LinkedIn Learning's focused lesson workspace. Preserve all existing functionality, permissions, business rules, content, dark mode, employee-ID authentication, mobile/frontline accessibility, RTL readiness and real AI integrations. No payments, public ratings, subscriptions or social-feed additions. User explicitly requests Astra extra-high implementation and browser testing, with phased percentage updates. Do not claim 100% without satisfying every gate below.

Repo baseline: main dd8bd11cac4df8ede1ef566431ad72285842a82d; deployed baseline 550f34b. Main adds CI/docs to deployed implementation. Work is isolated on codex/welearn-rework. Production deployment is separate from the reviewable implementation/preview handoff.

## Visual and interaction contract

- Brand is **welearn**, lower case: header, authentication, document titles, metadata, privacy copy, certificates, assistant prompts and current product documentation. Preserve LuLu as the customer/organization where factual, not the product name; keep existing cookie/data identifiers compatible.
- Light colors: white surface; #F7F9FC page; #172B4D foreground; #526477 muted text; #1559C9 primary action. Dark uses matching semantic tokens and readable blue/status contrast. Validate all final pairs.
- System UI sans with multilingual fallbacks; 16px body, 14px supporting text, 28-32px desktop/24px mobile page headings. 8px controls, 12px cards, subtle borders and restrained shadows. Tags/statuses alone use pills. No decorative counters/glowing nav/unnecessary page-entry animations. Reduced motion remains supported.
- Course covers use existing coverUrl plus consistent subject-illustration fallbacks. Never invent instructors, ratings, learners, or claims. Fully responsive imagery, explicit dimensions, alt handling and load-failure fallback.
- Every actionable control needs clear naming, loading, disabled, error/success, keyboard focus and small-screen behavior. Forms retain values after validation failures. Blocked states explain why/how to recover.
- Learner desktop: white header, brand, course search, Home, My Learning, Practice, HR Help, notifications, profile menu. Remove hover-expanding learner rail. Mobile tabs Home/Learning/Practice/HR Help/Profile; header search accessible.
- Home prioritizes direct Continue lesson with cover, lesson title/progress/time; required training urgency; paths; honest recommendation reasons. Optional drill secondary.
- /learn: URL-addressable My courses / Learning paths / Browse courses views; q selects browse results. Filters from existing tags/language/duration/enrollment status, result counts, clear filters, pagination, Back/refresh persistence.
- Course: image, description, objectives, duration, language, due/assignment state, one Start/Continue CTA. Modules accordion with lesson type/duration/progress/lock reason. Only earned certificates. Preserve current published-course access; no new enrollment policy.
- Path: ordered courses, completed/current/locked states, overall progress, next eligible step; explain prerequisite locks.
- Lesson: compact course header, prominent player/content; 320px contents panel at >=1200px; Overview/Transcript/Tutor below player; contents drawer below1200px. No competing global nav/contents/chat triple squeeze. All video/text/PDF/quiz/interview content remains supported.
- Continue opens unfinished lesson directly; video saved-position resume; text/PDF completion offers next eligible lesson without obligatory course-overview detour. Sequential/completion rules remain server-authoritative.
- Assessment: preflight, question navigation, timer, saved/offline status, accessible seven question types, unanswered-submission confirmation; distinguish provisional/pending/final-pass/final-fail/appeal/retry.
- Voice: consent/connecting/listening/responding/reconnecting/ended/result states, captions/mic controls/typed fallback/retake/review, existing review/consent preserved.
- HR: legible chat, suggestions/citations, text/voice switching, ticket history; preview and confirm escalation payload; preserve abstention and sensitive-topic routing.
- Profile: learning history/certificates/oral results/account; secondary optional points/streaks. Inbox clear unread/read states and destinations.
- Manager: labeled sidebar desktop/drawer mobile, urgency-first dashboard, searchable/filterable desktop team table/mobile rows, detail grouping learning/assignment/nudge/account-help/completions.
- Admin: group Learning/People/HR/Oversight navigation; course Curriculum/Settings tabs and lesson-type-specific fields; separate People/Import/Groups/Rules views; queue/list/detail for reviews/tickets/integrity/policies.
- Reports: six reports, named filters, Apply/Reset/counts, readable table, matching CSV; Ask Reports disclosed typed interpretation and proper scope.
- Login/activation/reset/privacy/MFA/loading/empty/error/forbidden/404 follow shared design without bypassing authentication or consent.
- Resume from Home one action; search results to course one action; course contents accessible every lesson; current workspace unmistakable.

## Interfaces

Keep existing routes and APIs compatible. Extend /learn query parameters for view, filters, sort and page, preserving q. Extend course presentation data with existing cover/metadata/progress/computed next lesson via shared outline service. Add nullable lastPositionSec to lesson progress, validate/clamp existing positionSec heartbeat against video duration, hydrate playback, and keep watched coverage independent from seeking. Add documented additive migration, preserving all historical records. Populate/edit existing coverUrl without a new media service. Keep existing theme/cookie identifiers compatible. Replace obsolete rail/design source tests with meaningful current behavior/accessibility checks, not weaker assertions.

## Tasks and phase weights

### Task 1: Baseline and qualification infrastructure (0-10%)

Controller owns setup: isolated managed checkout; dependencies; disposable PostgreSQL16+pgvector; no production DB writes. Baseline typecheck/unit tests/build. Inventory all37 page routes and their visible actions, role restrictions, APIs and workflow branches. Before screenshots from representative auth/learner/manager/admin/lesson screens. Preserve existing defect list. Save progress and requirements evidence in docs/qa. Existing visual-check resets admin MFA and assumes global Playwright: never run against deployed DB. Replace later with local tooling/dedicated known-MFA fixture accounts. No provider credentials are assumed available; real provider testing stays a release gate.

### Task 2: Shared design system, branding and shells (10-25%)

Implement complete token/primitives/branding/auth/system-surface replacement, learner header/mobile tabs, manager/admin desktop nav/mobile drawer, lesson shell. Establish accessible navigation/menus/dialogs; retain server session/role switching. Remove unused legacy rail layout and obsolete bento constraints. Core new components may be split by responsibility. Update design docs/guardrails for accepted direction. Verify typecheck, whole unit suite/build and render every representative shell at desktop/mobile and both themes. Controller records before/after.

### Task 3: Learner journeys (25-50%)

Implement home/library/catalog/path/course/lesson/progress migration, all five content types, assessment/voice/HR/ticket/practice/profile/inbox experience described above. Reuse domain logic, fix workflow regressions with meaningful behavioral tests, preserve all consent/grading/compliance rules. Browser qualification is later comprehensive phase, but verify each implemented slice now. Expected evidence: direct resume, query/filter history, all content types, complete/next navigation, honest offline/pending/error states, no overflow.

### Task 4: Manager and admin journeys (50-70%)

Implement all workspace routes and actions: team search/filter/detail/assignment/nudge/reset/reporting; admin overview/courses/type-specific authoring/people/import/groups/rules/reviews/corpus/tickets/integrity/reports/inboxes. Keep six reports, human review gates, one-time code handling, scoped exports. Implement clear mobile workflows. Verify persisted changes and at least one cross-role assignment story before claiming stage complete.

### Task 5: Browser suite and qualification (70-95%)

Project-local @playwright/test and test:e2e command, production-build server, PostgreSQL, worker and sweep fixtures; deterministic fixtures isolated from production and SMTP side effects. Test every required workflow/branch in matrix below; actual UI actions, not DB/API replacement of the operation under test. Add repeatable browser E2E and personally drive matrix journeys with browser-control tools. Run meaningful regression tests for discovered failures. Screen/route/action coverage is required, not screenshots alone. Tests must fail on relevant regressions and not skip failures. Browser control, screenshots, traces and action outcomes are distinct evidence.

### Task 6: Review and handoff (95-100%)

Fresh whole-branch code/spec review; fix material findings with targeted tests. Reviewable PR (attach in current chat), tested preview at exact commit, completed coverage matrix, screenshots before/after, browser traces/logs, reproduction commands/fixtures, migration+rollback instructions. Technical qualification and client visual approval recorded separately. Production publication is not part of this handoff. Completion audit item-by-item against this entire document, not merely passing current tests.

## Mandatory test matrix

For each record: ID, role, setup, steps, expected/actual result, environment/commit, browser/viewport, evidence and status. Persisted operations must survive refresh/new session. Fixtures include new/active/overdue/completed/expiring/empty users, two managers' teams, all lesson and question types, long multilingual content, provider failures. Fixtures/fault injection set conditions only; user actions execute through UI.

| ID | Journey and qualifying outcome |
|---|---|
| AUTH | Activation/sign-in/privacy/right destination; invalid credentials/reset/MFA setup+verify/logout/session-expiry; correct recovery and no protected content after logout. |
| NAV | Every route via intended nav, workspace switching, breadcrumbs, Back/Forward and direct links; active nav and state correct, no dead ends. |
| DISCOVER | Search/filter/paginate/detail/clear/empty/MyLearning tabs; counts/filter results/history and refresh agree. |
| PATH | Ordered path, locked-course explanation, complete prerequisite/unlock; direct URLs cannot bypass enforced locks. |
| CONTENT | Text/PDF complete/next/reload; progress agrees across course/outline/Home/profile; PDF fallback. |
| VIDEO | Actual playback/pause/leave/resume within heartbeat interval; transcript/citation seeks; coverage threshold90%; seeks alone never complete. |
| TUTOR | Grounded question/stream/citation/scope/failure; correct video destination, recoverable unavailable state. |
| QUIZ | All7 question types, back navigation/refresh,60-second disconnect/reconnect/submit; answer persistence, server timer, duplicate submit protection and stored result. |
| QUIZ-RULES | Practice/exam feedback/window not-yet-open/closed/timeout/cooldown/attempt limit/time accommodation; answers sealed until permitted. |
| REVIEW | Provisional/fail to admin confirm/adjust to learner result/appeal; finality, notifications, completion and cert agree; provisional cannot finalize compliance. |
| VOICE | Consent/oral conversation/pass/fail/retake/human overturn; mic denial/disconnection/typed fallback; mic ends, transcript remains, offline labeled. |
| HR | Ask/citation/policy section/unsupported/sensitive handoff/escalation cancel+confirm; scopes/citations correct, no ticket before confirmation. |
| TICKET | Learner ticket/admin reply+resolve/learner thread; shared status and no unrelated-user access. |
| PRACTICE | Locked/unlocked questions/confidence/result/return; saved optional state never changes mandatory compliance. |
| MANAGER | Team filters/member/assign course+path/learner notification+completion/reports; assignment once, due correct, team isolation. |
| PEOPLE | CSV valid/invalid/duplicate, edit person/group, rules create/disable/enable; clear errors, correct affected users, no duplicate enrollments. |
| AUTHOR | Create draft/add all5 lesson types/reorder/configure/save/publish/unpublish/learner view; fields relevant, persistence and visibility/order agree. |
| POLICY | Publish/ingest/query/supersede/query again/failure/retry; new answers active allowed version, old citation reconstructable. |
| INTEGRITY | Consent/monitored attempt/events/review/void/retry; persisted decisions, unsupported fullscreen degrades, flags not auto-fail. |
| REPORTS | All6 reports/filter/export/NL Ask as both roles; CSV rows agree, interpretation shown, scope enforced. |
| COMPLIANCE | Due transitions/reminder/completion/cert/expiry/recert; all roles agree, correct PDF, immutable prior completion, no duplicate reassignment. |
| ACCOUNT/SYSTEM | Inbox/profile/cert/privacy/permitted export+erasure/empty/loading/error/404; all actions scoped and recoverable, erasure disposable fixture only. |

Continuous cross-role chains with same records: (1) admin publish → manager assign → learner complete → certificate → both reports; (2) pending assessment → admin decision → learner final notification → compliance; (3) HR escalation → admin reply/resolution → learner thread.

## Qualification gates

1.100% inventoried routes/actions/required branches have recorded results, all required cases pass. Blocked/skipped is unverified. No unresolved critical/high, primary-action failures, data loss, wrong certification/completion, permission leaks or cross-role breakage. Deterministic suite twice consecutively without retries concealing failure. Typecheck/unit/build/browser commands green.
2.Full Chromium workflow suite1440x900 and390x844, admin included. Every template inspected360x800,768x1024,1280x800. Auth/learning/assessment/HR-ticket and three cross-role chains repeated Firefox/WebKit. Real Safari/iOS media/mic before claiming iOS voice qualification; emulator cannot prove hardware. Both themes/keyboard/200% zoom/reduced motion/RTL. No page overflow/clipped actions/hidden focus/sticky overlap; report tables may use labeled horizontal scroll.
3.WCAG2.2AA target, keyboard/focus manual+automated accessibility; no serious/critical automated findings;44px product touch targets, accessible controls/non-color statuses. Consistent hierarchy/spacing/images/action placement across all templates. No accidental rejected chrome. Client visual approval is separate, not inferred from tests.
4.Production-build measurements on authenticated Home/catalog/course/lesson/manager/admin; record mobile measurement configuration; median3 runs LCP<=2.5s,CLS<=0.1, representative interaction<=200ms. Lab results not field CWV claims. Real YouTube/AI/voice staging verification plus deterministic offline/fault cases. Missing credentials/hardware explicit blocker; mock success does not qualify live.
5.Deliver exact-commit preview+PR, matrix/results, traces/step logs/failure and success evidence, before-after all families, reproduction commands/fixtures, qualification report passed/failed/blocked/unverified, migration/rollback.

## Sources

- https://www.coursera.org/ and https://www.coursera.org/learn/introduction-to-cloud
- https://learning.linkedin.com/content/dam/me/learning/en-us/pdfs/lil-guide-how-to-use-linkedin-learning.pdf (interaction principles; historical guide)
- https://www.w3.org/WAI/WCAG22/quickref/
- https://web.dev/articles/vitals

## Execution notes

No existing functionality may be silently removed to satisfy tests or ease implementation. Shared agent model gpt-6-astra/xhigh as requested. Controller owns integration/QA/environment and dispatches one implementer at a time; fresh scoped review after each implementation task. Keep authoritative evidence/progress under docs/qa and ignored logs/artifacts separately. Completion percentages reflect accepted phase work, not elapsed time or files edited.

## Accepted qualification limitation (user clarification, 2026-09-26)

The user confirmed there is no staging access yet and instructed us to record real AI/voice staging and actual iPhone microphone/media checks as **UNVERIFIED**. These unavailable external checks must remain explicit in the handoff. Complete the local implementation and available browser qualification without waiting for staging; distinguish delivery progress from live-provider/iOS release qualification. This clarification does not waive any locally testable workflow, security, accessibility, persistence, or responsive gate.
