# Route coverage

Both complete 741-case runs and supporting evidence were reconciled into [coverage-inventory.json](coverage-inventory.json) and [workflow-cases.json](workflow-cases.json). PASSED_LOCAL covers the mapped local cases only; real providers and physical iPhone remain UNVERIFIED. The historical Tutor acceptance item remains open in [QUALIFICATION.md](QUALIFICATION.md).

| Route | Role | Recorded local outcome |
|---|---|---|
| `/activate` | public/auth | PASSED_LOCAL |
| `/login/mfa-setup` | public/auth | PASSED_LOCAL |
| `/login/mfa` | public/auth | PASSED_LOCAL |
| `/login` | public/auth | PASSED_LOCAL |
| `/ask-hr/live` | learner | PASSED_LOCAL |
| `/ask-hr` | learner | PASSED_LOCAL |
| `/ask-hr/tickets/[ticketId]` | learner | PASSED_LOCAL |
| `/course/[courseId]` | learner | PASSED_LOCAL |
| `/drill` | learner | PASSED_LOCAL |
| `/home` | learner | PASSED_LOCAL |
| `/inbox` | learner | PASSED_LOCAL |
| `/learn` | learner | PASSED_LOCAL |
| `/lesson/[lessonId]/interview` | learner | PASSED_LOCAL |
| `/lesson/[lessonId]` | learner | PASSED_LOCAL |
| `/path/[pathId]` | learner | PASSED_LOCAL |
| `/policy/[docId]` | learner | PASSED_LOCAL |
| `/profile` | learner | PASSED_LOCAL |
| `/quiz/[quizId]` | learner | PASSED_LOCAL |
| `/admin/corpus` | admin | PASSED_LOCAL |
| `/admin/courses/[courseId]` | admin | PASSED_LOCAL |
| `/admin/courses` | admin | PASSED_LOCAL |
| `/admin/inbox` | admin | PASSED_LOCAL |
| `/admin/integrity/[attemptId]` | admin | PASSED_LOCAL |
| `/admin/integrity` | admin | PASSED_LOCAL |
| `/admin` | admin | PASSED_LOCAL |
| `/admin/people` | admin | PASSED_LOCAL |
| `/admin/reports` | admin | PASSED_LOCAL |
| `/admin/reviews` | admin | PASSED_LOCAL |
| `/admin/tickets/[ticketId]` | admin | PASSED_LOCAL |
| `/admin/tickets` | admin | PASSED_LOCAL |
| `/team/[userId]` | manager | PASSED_LOCAL |
| `/team/[userId]/reset-code` | manager | PASSED_LOCAL |
| `/team/inbox` | manager | PASSED_LOCAL |
| `/team` | manager | PASSED_LOCAL |
| `/team/reports` | manager | PASSED_LOCAL |
| `/` | public/auth | PASSED_LOCAL |
| `/privacy-notice` | public/auth | PASSED_LOCAL |

Inventory: 37 page routes, 45 app/shared server actions and 23 API routes. The unbound compatibility wrapper remains source-reviewed, not a separately exercised visible UI control.
