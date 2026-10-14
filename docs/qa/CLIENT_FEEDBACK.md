# Course and instructor feedback qualification

Local implementation follows the approved five-role foundation on main. This is not evidence of a Railway deployment or real email delivery.

## Contract

Employees may submit optional attributed 1–5 course and delivered-instructor ratings after each completed learning cycle. New assignments retain immutable instructor/department snapshots; reassignment and renewal do not retarget older responses. Legacy unknown instructors remain unknown. Completion and certificates do not depend on feedback.

One response per person/cycle/kind; every creation, edit and moderation decision has an audit revision. Duplicate requests replay; stale revisions return a conflict while preserving entered values and offering the newer saved response. Comments support Unicode/multiple lines and remain limited to 2,000 characters.

HR/Super Admin have attributed organization detail and reasoned moderation. Department Heads have delivery-department course detail and aggregate instructor ratings. Instructors have their own delivered-cycle ratings/comments without employee account identity; small groups and comments can still identify a writer. Empty scopes return no responses and no invented average.

Reports use original-submission cohorts and the latest revision before the period ends. Late edits do not rewrite a closed period or create new respondents. Currently hidden comments stay suppressed even in older reports. Hiding retains a valid rating; audited invalid-response exclusion follows the reporting cutoff. CSV uses exactly these scopes and neutralizes spreadsheet formulas.

Personal-data export includes only the person's own responses and related revisions. Erasure scrubs comments, revision text and moderation reasons while retaining de-identified ratings and statutory completion/certificate history. Per-user serialization plus a transaction prevents racing feedback writes from recreating private text.

## In-app digest operations

`npm run feedback:digests -- week` summarizes the just-finished Monday-based organization week. `npm run feedback:digests -- month` summarizes the previous calendar month. Both use Asia/Dubai and issue separate course/instructor summaries to active HR, Department Head and Instructor recipients. Super Admin can read reports but is not a scheduled recipient.

Each recipient/interval/feedback-kind/period has a unique persisted completion marker committed with its notification. Repeats and concurrent runs dedupe; partial failures return a failed command and retain successful recipients so a retry fills only missing summaries. Bodies contain counts/averages and scoped report links, never comments or employee identities. Successful markers qualify in-app delivery only.

For the future Railway release, configure separate terminating cron services with the same app revision and private database reference:

| Service | Start command | UTC schedule |
|---|---|---|
| Weekly feedback | `npm run feedback:digests -- week` | `10 0 * * 1` |
| Monthly feedback | `npm run feedback:digests -- month` | `10 0 1 * *` |

These execute at 04:10 Asia/Dubai, after the prior week/month closes. Railway schedules use UTC and cron processes must close connections and exit. [Railway cron documentation](https://docs.railway.com/cron-jobs)

The command closes its database pool and exits. These production schedules have not been installed. The existing email sender remains a console/queued stub; no email delivery claim follows from an in-app notification or its channel metadata.

## Evidence to date

- 274 unit tests, type check and production build pass; independent review and final combined qualification are still in progress.
- Delivery/role migrations applied twice with unchanged hashes for seven pre-existing identity/learning tables; rating constraints tested in SQL.
- Real assignment/completion/reassignment/renewal preserves the delivered instructor and old completion bytes; legacy unknown context is preserved.
- Real service checks prove ownership, duplicate replay, ignored forged instructor, a single concurrent edit winner, one respondent and persistent revisions.
- Learner save/edit/conflict/foreign-denial journeys: 4/4 cross-engine. Report+CSV scope journeys: 4/4 cross-engine. Moderation/author-state/direct replay checks: 4/4 cross-engine. Existing completion/profile checks: 2/2; report privacy/download checks: 6/6; snapshot path/renewal checks: 8/8.
- Real SQL checks prove historical cutoff/cohort, current hiding across history, overlapping-group exclusion, historical delivered-instructor access and removed-department fail-closed scope.
- Real moderation/DSR/digest probe proves hidden ratings, audited exclusion/restoration, private text scrubbing, simultaneous erasure/write protection and preserved completion/aggregate history. Injected notification failure rolls back its marker; the retry delivers only the missing recipient/type. Monthly/weekly reruns produce zero new notifications.

Evidence and failed/fixture-repair traces live in the isolated checkout under `.artifacts/client-requirements-20261014/` and this plan's ignored execution workspace. External provider answers, physical-device behavior, production email/scheduling and hosted provisioning remain separate release/acceptance gates.

Latest local monthly CLI invocation exited successfully: 0 new in-app summaries, 584 already processed. Invalid interval exited with usage and no database work. No Railway schedule or email delivery was created by these checks.
