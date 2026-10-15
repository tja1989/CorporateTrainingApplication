# Feedback privacy wording — proposal for sign-off

Status: **proposal only.** The shipped text has not changed. It changes only after the client (and whoever owns privacy wording for them) approves it.

Why: the current paragraph is accurate but long, and it uses system words ("attributed", "aggregated", "delivered instructor", "account names"). The proposal says the same four facts in plain words.

## Learner feedback page

Shown above the course and instructor feedback forms (`app/(learner)/course/[courseId]/feedback/page.tsx`).

| Current (shipped) | Proposed |
|---|---|
| Feedback is attributed to your account. HR and Super Admin can read both responses. The course’s Department Head can read attributed course comments and aggregated instructor ratings. The delivered instructor can see ratings and comments without account names; small groups and what you write may still identify you. | Your feedback is saved with your name. HR and Super Admin can read all of it. The course’s Department Head can read your course comments with your name, and sees instructor ratings only as totals. The instructor who taught you sees ratings and comments without names, but in a small group, or from what you write, they may still work out who you are. |

## Instructor feedback report

Shown under "Feedback reports" for Instructors (`components/feedback-reports.tsx`).

| Current (shipped) | Proposed |
|---|---|
| Ratings and comments for courses you delivered. Account names are omitted; small groups or comments can still identify a writer. | Ratings and comments for courses you taught. Names are hidden, but in a small group, or from what someone writes, you may still be able to tell who wrote it. |

## What stays the same

- Who can see what. Only the words change.
- Both notices stay where they are, in full, before anyone submits or reads feedback.
- The note that people may still be identified stays. It is the most important sentence.

## If approved

- Change the two strings above.
- `e2e/client-feedback.e2e.ts` line 90 matches the start of the current learner text ("Feedback is attributed to your account") and must be updated in the same change.

Sign-off: ____________________  Date: __________
