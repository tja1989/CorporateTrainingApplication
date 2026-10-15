# Course planning qualification

The approved scheduling phase adds optional Dubai calendar dates, explicit course prerequisites, nested catalog folders, Upcoming assigned training, and actual enrollment dates. Roles, approval and feedback remain the preceding foundation. Local qualification does not establish a Railway release.

## Behavior

Instructor planning edits use the existing draft revision and Department Head approval process; HR publishes and assigns. Dates and prerequisites are checked again on submission/publication. Stale saves, foreign ownership, missing dependencies and cycles fail inside the serialized curriculum transaction. Old forms that omit the planning marker retain all existing metadata.

Published future training can be assigned before opening. Start dates block lesson content and learning writes, including existing quiz and oral sessions. A short shared curriculum lock makes final credit observe concurrent author edits. No provider request runs inside that transaction. Course end dates are completion targets, so overdue training remains completable. Published catalog learning records voluntary participation on its first real credited learning write, as `source=self`, with its own delivery snapshot; it does not impersonate an HR assignment. Prior participation rows are preserved and no historical evidence is backfilled. New assignments use an explicit deadline first, otherwise the course end date. Existing assignments retain their stored deadlines; conflicting multi-course targets create no partial assignments. Automatic assignments and certificate renewal wait when their target deadline is impossible.

Every prerequisite needs immutable completion evidence. Renewing a prerequisite does not erase that evidence or relock dependent training. Unavailable unfinished dependencies remain blocked and use generic names rather than leaking private draft titles. Earlier completion feedback and certificates remain readable while a later schedule blocks learning.

Folders are normalized course paths with up to eight levels. Catalog branches and counts respect the current audience and filters. Descendant matching uses segment boundaries, so Safety does not include Safetyware. URL selection, breadcrumbs and browser Back preserve scope. Standalone empty folders and bulk renaming are outside the approved design.

## Evidence

- Pure policies and full unit suite: 297/297, with a passing type check and production build. Date parsing/opening boundaries, deadline precedence, folder normalization/Unicode/boundaries and graph validation have focused cases.
- Populated local migration: repeated application preserves hashes of thirteen identity/learning/feedback tables and the existing prerequisite graph. SQL constraints and old defaults are checked separately.
- Real database probes cover ownership/revisions/approval invalidation, immutable prerequisite history, assignment deadline behavior and unchanged duplicates, concurrent graph edits, automatic whole-path assignment, racing author/learner writes, pending/idempotent renewal, and five quiz/oral blocked-then-open operations. Offline objective quiz and oral checks award real test certificates after opening; this is provider-free evidence.
- Browser planning matrix: 24/24 across desktop/mobile Chromium, Firefox and WebKit. Each profile runs author → Department Head → HR → Employee, nested folders with Unicode/punctuation, keyboard navigation and dark-theme accessibility checks, direct HTTP video/quiz/oral negative and positive checks, and overdue assignment completion with a certificate.
- Fixture setup is explicit: fictional users, legacy published prerequisite courses and initial lessons/questions are created directly in the isolated local database. Planning edits, review, publication, rollout and learner completion use the actual UI; the HTTP case advances server-side fixture dates separately. Browser clock changes are not used as proof of opening.

The single fresh code and visual reviews returned five Important workflow findings and two material UI findings. The correction pass covers atomic/retryable human grading, staged free-text review rows, voluntary prerequisite participation with explicit `self` provenance, direct/indirect/combined ordered-path conflicts, time-based rule retries through the real daily sweep, honest path/lesson navigation, mobile explanation order and undated wording. Real database probes observed RED then GREEN for every workflow finding; five new UI cases likewise observed RED then GREEN. The corrected source passes 36/36 browser cases across desktop/mobile Chromium plus Firefox/WebKit desktop and nine affected approval/feedback/path/renewal regressions. Earlier 24-case coverage also included Firefox/WebKit mobile. Historical feedback-page navigation and actual certificate PDF responses are included in the corrected target-only prerequisite journey.

The integrated main checkout at application commit `d44a48c` passes 297 units, type check and its own production build. Final-source planning browsers pass 54/54 across desktop/mobile Chromium, Firefox and WebKit; nine affected regressions and three final author/ordered-path rechecks pass. All 66 associated traces were CRC-checked. The preview now runs this main build at https://localhost:3445/login with its preserved 32-person database. Five demo password sign-ins pass: Super Admin/HR correctly reach mandatory MFA setup; Department Head/Instructor/Employee reach their workspaces. Actual Instructor planning fields, Employee Upcoming/schedule and the unchanged enrollment timestamp were checked against this runtime. Review details and the single deferred minor are in [course-planning-review.md](reviews/course-planning-review.md).

## Release boundary

No Railway deployment or CI exception is included. Production migration needs a backup and hosted verification. Provider keys remain disabled in local checks. Real SMTP, installed production schedules, wider notification composition/events, profile/dashboard/marksheet detail, HRMS synchronization and leadership/video-quiz clarification remain subsequent client work. Desktop engine/mobile viewport coverage does not qualify a physical phone.

## Completion audit against the eight acceptance families

| Requirement | Authoritative evidence |
|---|---|
| Additive/repeatable migration and preserved histories | `qa-client-migration.ts` twice-applied hashes for13tables, SQL constraints/defaults and graph preservation; populated test DB and clean32-person preview both pass. |
| Owned/revisioned author settings and approval | `qa-course-planning.ts context/graph`; real browser author→Department Head→HR journey, invalid-date input retention, and direct/indirect/combined ordering probes in `qa-planning-review.ts`. |
| Future assignment/Upcoming and exact opening | Browser rollout uses real start/end fields; `course-planning` and access-policy unit cases verify calendar parsing and exact server-instant opening; enrollment date equals its stored timestamp. |
| All learning/Tutor/assessment boundaries and races | Actual HTTP video/Tutor/quiz/oral denial checks; no Tutor thread, progress, grades or certificates created while blocked. Service negative/positive modes and author/credit/submission races pass; blocked human reviews retain retry state. |
| Prerequisites, ordered paths and historical evidence | Target-only assignment completes its prerequisite through the actual learner UI, then earns target certificate; renewal probes retain immutable prerequisite completion; earlier own feedback and actual PDF remain accessible when later gated. |
| Non-closing end target/deadlines/renewal | Overdue enrollment completes with certificate; explicit/default due, unchanged duplicate rows, whole-path pending rules, actual daily retry and targeted pending/idempotent renewal probes pass. |
| Nested folders and URL behavior | Unicode/punctuation branch navigation, segment-prefix exclusion, filtered counts, breadcrumbs, keyboard and Back; folder/date/graph policies have focused unit cases. |
| Cross-role/render/accessibility/release |54planning browser passes across6profiles, dark axe/keyboard/no-overflow and mobile gate geometry; one fresh code+visual review and one verified correction pass; integrated-main checks and live32-person preview smoke. |

Evidence logs and execution ledger are preserved in `.artifacts/client-requirements-20261014/course-planning-evidence.tar.gz`; browser traces/screenshots remain in the neighboring `planning-*` directories. No credentials are included in this archive. The clean preview was backed up with PostgreSQL16 after additive preservation checks; the earlier baseline backup is also retained.
