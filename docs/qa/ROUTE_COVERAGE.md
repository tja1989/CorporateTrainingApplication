# Route coverage

Current inventory with phase evidence in [coverage-inventory.json](coverage-inventory.json) and [workflow-cases.json](workflow-cases.json). NOT_TESTED and UNVERIFIED never mean pass. A route pass covers recorded cases only; final exact-commit qualification is still pending.

| Route | Role | Status |
|---|---|---|
| `/activate` | public/auth | PASSED |
| `/login/mfa` | public/auth | PASSED |
| `/login/mfa-setup` | public/auth | PASSED |
| `/login` | public/auth | PASSED |
| `/ask-hr/live` | learner | NOT_TESTED |
| `/ask-hr` | learner | NOT_TESTED |
| `/ask-hr/tickets/[ticketId]` | learner | NOT_TESTED |
| `/course/[courseId]` | learner | NOT_TESTED |
| `/drill` | learner | NOT_TESTED |
| `/home` | learner | NOT_TESTED |
| `/inbox` | learner | NOT_TESTED |
| `/learn` | learner | NOT_TESTED |
| `/lesson/[lessonId]/interview` | learner | NOT_TESTED |
| `/lesson/[lessonId]` | learner | NOT_TESTED |
| `/path/[pathId]` | learner | NOT_TESTED |
| `/policy/[docId]` | learner | NOT_TESTED |
| `/profile` | learner | NOT_TESTED |
| `/quiz/[quizId]` | learner | NOT_TESTED |
| `/admin/corpus` | admin | NOT_TESTED |
| `/admin/courses/[courseId]` | admin | NOT_TESTED |
| `/admin/courses` | admin | NOT_TESTED |
| `/admin/inbox` | admin | NOT_TESTED |
| `/admin/integrity/[attemptId]` | admin | NOT_TESTED |
| `/admin/integrity` | admin | NOT_TESTED |
| `/admin` | admin | NOT_TESTED |
| `/admin/people` | admin | NOT_TESTED |
| `/admin/reports` | admin | NOT_TESTED |
| `/admin/reviews` | admin | NOT_TESTED |
| `/admin/tickets/[ticketId]` | admin | NOT_TESTED |
| `/admin/tickets` | admin | NOT_TESTED |
| `/team/[userId]` | manager | NOT_TESTED |
| `/team/[userId]/reset-code` | manager | NOT_TESTED |
| `/team/inbox` | manager | NOT_TESTED |
| `/team` | manager | NOT_TESTED |
| `/team/reports` | manager | NOT_TESTED |
| `/` | public/auth | NOT_TESTED |
| `/privacy-notice` | public/auth | PASSED |

Inventory: 37 page routes, 42 app/shared server actions, 22 API routes. See JSON for methods and operation evidence.
