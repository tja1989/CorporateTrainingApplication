# xprtn client demo — 8 minutes

## Start here

Redesigned local preview: http://127.0.0.1:3100/login

Railway: https://corporatetrainingapplication-production.up.railway.app/login

The public site still serves the older LuLu Learn version until the redesign deployment is verified. The local preview has fictional demo data and explicitly labeled offline AI and typed oral checks. Keep this computer awake and its lid open while presenting the local preview.

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

181 unit tests, type check and build passed. 16 desktop/mobile Chromium workflow checks passed, including the full admin-publish → manager-assign → learner-complete → certificate/report chain. 12 additional Firefox/WebKit Tutor executions passed. The historical Tutor acceptance incident and real-provider/physical-iPhone gates remain open; today's focused smoke is not a full release qualification.
