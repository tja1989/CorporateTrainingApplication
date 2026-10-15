# Course planning qualification

The approved scheduling phase adds optional Dubai calendar dates, explicit course prerequisites, nested catalog folders, Upcoming assigned training, and actual enrollment dates. Roles, approval and feedback remain the preceding foundation. Local qualification does not establish a Railway release.

## Behavior

Instructor planning edits use the existing draft revision and Department Head approval process; HR publishes and assigns. Dates and prerequisites are checked again on submission/publication. Stale saves, foreign ownership, missing dependencies and cycles fail inside the serialized curriculum transaction. Old forms that omit the planning marker retain all existing metadata.

Published future training can be assigned before opening. Start dates block lesson content and learning writes, including existing quiz and oral sessions. A short shared curriculum lock makes final credit observe concurrent author edits. No provider request runs inside that transaction. Course end dates are completion targets, so overdue training remains completable. New assignments use an explicit deadline first, otherwise the course end date. Existing assignments retain their stored deadlines; conflicting multi-course targets create no partial assignments. Automatic assignments and certificate renewal wait when their target deadline is impossible.

Every prerequisite needs immutable completion evidence. Renewing a prerequisite does not erase that evidence or relock dependent training. Unavailable unfinished dependencies remain blocked and use generic names rather than leaking private draft titles. Earlier completion feedback and certificates remain readable while a later schedule blocks learning.

Folders are normalized course paths with up to eight levels. Catalog branches and counts respect the current audience and filters. Descendant matching uses segment boundaries, so Safety does not include Safetyware. URL selection, breadcrumbs and browser Back preserve scope. Standalone empty folders and bulk renaming are outside the approved design.

## Evidence

- Pure policies and full unit suite: 297/297, with a passing type check and production build. Date parsing/opening boundaries, deadline precedence, folder normalization/Unicode/boundaries and graph validation have focused cases.
- Populated local migration: repeated application preserves hashes of thirteen identity/learning/feedback tables and the existing prerequisite graph. SQL constraints and old defaults are checked separately.
- Real database probes cover ownership/revisions/approval invalidation, immutable prerequisite history, assignment deadline behavior and unchanged duplicates, concurrent graph edits, automatic whole-path assignment, racing author/learner writes, pending/idempotent renewal, and five quiz/oral blocked-then-open operations. Offline objective quiz and oral checks award real test certificates after opening; this is provider-free evidence.
- Browser planning matrix: 24/24 across desktop/mobile Chromium, Firefox and WebKit. Each profile runs author → Department Head → HR → Employee, nested folders with Unicode/punctuation, keyboard navigation and dark-theme accessibility checks, direct HTTP video/quiz/oral negative and positive checks, and overdue assignment completion with a certificate.
- Fixture setup is explicit: fictional users, legacy published prerequisite courses and initial lessons/questions are created directly in the isolated local database. Planning edits, review, publication, rollout and learner completion use the actual UI; the HTTP case advances server-side fixture dates separately. Browser clock changes are not used as proof of opening.

Historical evidence navigation, affected regressions, fresh independent review, combined-main verification and the refreshed 32-person preview are still being finalized. This document will record their final results before completion.

## Release boundary

No Railway deployment or CI exception is included. Production migration needs a backup and hosted verification. Provider keys remain disabled in local checks. Real SMTP, installed production schedules, wider notification composition/events, profile/dashboard/marksheet detail, HRMS synchronization and leadership/video-quiz clarification remain subsequent client work. Desktop engine/mobile viewport coverage does not qualify a physical phone.
