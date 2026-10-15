# xprtn client demo — 8 minutes

## Client requirement update

The five-role approval, course/instructor feedback and approved course-planning implementation are now on main. The reviewed application implementation is `d44a48c`; the local preview runs that main build. Hosted Railway remains the earlier demo release described below. Existing hosted accounts are not automatically promoted to HR or Instructor. Fresh fictional-seed logins and provisioning are in [CLIENT_ROLES_APPROVAL.md](qa/CLIENT_ROLES_APPROVAL.md); feedback qualification and scheduling boundaries are in [CLIENT_FEEDBACK.md](qa/CLIENT_FEEDBACK.md).

Planning qualification:297unit tests, type check/build,54/54planning browser cases across desktop/mobile Chromium, Firefox and WebKit, nine affected regressions and three final author/path rechecks. The earlier feedback qualification passed60/60. All runs use fictional local data and zero retries/skips. The approved chain covers authoring, Department Head rejection/correction/approval, HR publication/rollout, Employee completion/certificate, both feedback kinds, scoped reports/native CSV, moderation and in-app period summaries. Live email, installed production schedules, provider answers and HRMS synchronization remain open.

For the client checklist, show the five-role chain first. After the Employee earns the certificate, open **Give course feedback**, save the course and instructor ratings, then revisit to edit them. HR → **Feedback reports** shows both types, period summaries and reasoned moderation. Department Head reports follow the training’s historical delivery department; Instructor reports omit employee account names. Feedback is optional, and instructors cannot rate themselves.

Planning demo: Instructor → course Settings shows start/end dates, prerequisite choices and a nested folder path. Edits follow the same Department Head approval and HR publication chain. HR rollout can use course end dates; employees see future assignments under **Upcoming**, with actual enrollment and due dates on course detail. Course end dates permit overdue completion. Unassigned published prerequisites create voluntary participation on the first credited learning action, preserving their real completion evidence. See [planning qualification](qa/CLIENT_COURSE_PLANNING.md).

All five existing demo password sign-ins were verified on the refreshed preview. Super Admin and HR still require the user's authenticator setup; no test authenticator was installed on those accounts. Department Head, Instructor and Employee sign-ins reach their workspaces.

## Start here

Current client roles/feedback/planning preview (32 fictional accounts): https://localhost:3445/login

Earlier redesigned preview: http://127.0.0.1:3100/login

Railway: https://corporatetrainingapplication-production.up.railway.app/login

The redesigned xprtn build is live on Railway at commit `3d8ffcc` (the app code is unchanged from the merged `24da41e` release). The local preview has fictional demo data and explicitly labeled offline AI and typed oral checks. Keep this computer awake and its lid open while presenting the local preview.

Provider check on 14 October: the original hosted Anthropic key returned `401 invalid x-api-key`. The user replaced it and approved a second manual deployment, which became active at 15:39 IST with initialization ready. An actual HR question now returns `400 invalid_request_error`: the new key is not scoped to a workspace, so Anthropic requires the `anthropic-workspace-id` header. Use a workspace-scoped key for the current app, or add explicit workspace-header support before using a multi-workspace key. Gemini still denies project access. Use the local preview for AI/oral demonstrations until actual hosted answers/connections pass. The hosted learner/course interface is verified. The missing fictional policy corpus was restored (6 documents, 20 chunks), and the original hand-hygiene video's legacy duration was corrected from 148 to 86 seconds.

Text model: Claude Sonnet 5.5 (`AI_MODEL=claude-sonnet-5-5`). After the user approved the manual deployment, Railway deployment `9554e12d` became active on 14 October with initialization ready at 19:03 IST. Wait for CI remained enabled. An actual hosted HR salary question still returns Anthropic's missing-workspace-header error; the model setting is deployed, but live answers remain blocked by the key's workspace requirement. Gemini access is also unresolved.

| Role | Employee ID | Password | Use |
|---|---|---|---|
| Learner | `AE10024` | `demo1234` | Meera: directly assigned Food Safety, without a path prerequisite |
| Learner | `AE10023` | `demo1234` | Farhan: ordered onboarding and POS continuation |
| Manager | `AE20001` | `demo1234` | Joseph: team, assignments and reports |
| Admin | `AE90001` | `demo1234` | Amina: authoring and human reviews; authenticator setup/code also required |

Sign in as Meera before the call and acknowledge the privacy notice if shown. Prepare the manager session in a separate browser profile if you want to change roles instantly. Administrator MFA must be ready before showing that optional section.

## 1. Learning — 2 minutes

1. Home: show Continue lesson, progress and required-training priority.
2. My Learning (Learning on mobile): open Food Safety Essentials. Show objectives, duration, the single Start/Continue action and the module outline.
3. Open the hand-hygiene video. Show the focused lesson workspace, desktop contents sidebar or mobile drawer, and Overview / Transcript / Tutor tabs.
4. Ask Tutor: **When should I wash my hands?** Show readable answer formatting and citations. Local answers are labeled offline demos. The bundled public video/transcript is illustrative, not reviewed client training content.
5. Open **The cold chain**, choose **Mark complete**, and show confirmed progress and the next eligible lesson. The printable hygiene PDF is another quick example.

## 2. Oral assessment — 2 minutes

1. In Food Safety open **Oral check: show what you learned**.
2. Show consent: microphone only while the screen is open; transcript retained; audio not stored.
3. Local preview: use the typed demo. Spoken mode on Railway should be presented only after its actual connection is checked; Type instead is the recovery path for noise or microphone denial.
4. Useful answers: wash with soap for at least twenty seconds; chilled food below five degrees and frozen below minus eighteen; log fridge temperatures and promptly store deliveries.
5. Show score, pass mark, feedback and updated lesson progress. Explain the human review queue for failed checks.

## 3. HR help — 2 minutes

1. Open **HR Help** and ask **How many days of annual leave do I get?**
2. Open a policy citation. Follow up with **What about sick leave?**
3. Show **Ask HR directly** and review the proposed transcript. Cancel to demonstrate consent without creating a ticket; confirm only if showing the admin reply workflow.
4. Optional verified live build: Talk to your assistant → Start talking → **What training is due for me?** → End conversation → Continue in text.

## 4. Manager value — 2 minutes

1. Sign in as Joseph (`AE20001`). Show the team priorities and direct-nudge needs.
2. Open Meera's record to show assignments, progress and assessment results.
3. Open Reports; show completion or compliance, a filter and CSV export.
4. Optional prepared admin session: course Curriculum/Settings and Review queues show authoring and human control over AI decisions.

## Fallbacks and closing

- If a video is slow, move to the text lesson or PDF; course contents remain available.
- If live AI or speech is unavailable, use text and the explicitly labeled local demo.
- If Food Safety is locked for Farhan, use Meera or show the prerequisite explanation.
- If administrator MFA is not ready, finish with the manager dashboard; keep MFA enabled.

Close with: **“xprtn combines structured learning, grounded assistance, assessments and manager visibility in one workflow. This demo uses fictional organization and policy data. Reviewed client content and rollout qualification are the next step.”**

## Today's verified scope — 14 October 2026

Source: `3d744d7`; fresh production build: `2LqjVk9AEhX7q92s6zOxF`.

181 unit tests, type check and build passed. 16 desktop/mobile Chromium workflow checks passed, including the full admin-publish → manager-assign → learner-complete → certificate/report chain. 12 additional Firefox/WebKit Tutor executions passed. The merged main checkout also passes 181 tests and its type check. The historical Tutor acceptance incident and real-provider/physical-iPhone gates remain open; today's focused smoke is not a full release qualification.

The hosted database was backed up at 14:53 IST before release. GitHub CI could not start because of an account billing lock; the user approved the initial manual Railway deployment using the local evidence, then separately approved the key-update deployment. Wait for CI was restored after the initial build and remained enabled during the key update. Hosted initialization reports `ready` and all 30 original demo users remain.

Hosted Joseph manager sign-in and team dashboard were verified. 24 stale past-due open enrollment statuses were refreshed under the existing overdue rule; Joseph's team now shows 19 overdue assignments, consistently with the learner's overdue course. Completion history was not edited.

Role/approval phase integrated into main at `254632b`: five workspaces, Department Head decisions, HR publish/rollout, Instructor draft correction and audited archive restoration. Final qualification: 255 units and 36 cross-engine browser journeys, plus 16 path/renewal/HR privacy/inbox regressions. Course/instructor feedback follows in the approved second plan. Railway still requires its separate verified deployment.
